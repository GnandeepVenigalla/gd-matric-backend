const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Timesheet = require('./models/Timesheet');
const Invoice = require('./models/Invoice');


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Ensure uploads directory exists

// Multer Config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// We configure Multer to use S3 if a bucket is provided, otherwise local storage.
const s3Storage = multerS3({
  s3: s3,
  bucket: process.env.AWS_BUCKET_NAME || 'my-matrix-bucket',
  key: function (req, file, cb) {
    const employer = req.body.clientProject ? req.body.clientProject.replace(/[^a-zA-Z0-9]/g, '_') : 'Unknown';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Organized by employer
    cb(null, `${employer}/timesheets/${uniqueSuffix}-${file.originalname}`);
  }
});

// Replace the previous local storage upload with S3 storage
const upload = multer({ storage: process.env.AWS_BUCKET_NAME ? s3Storage : storage });


app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// MongoDB connection is now established before starting the server (see bottom of file)

const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

// --- AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, role, name, companyName, title, inviteCode: reqInviteCode } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already exists' });
    
    let assignedCompanyName = companyName || 'GD Matrix';
    let newInviteCode = null;

    if (role === 'employer') {
       newInviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    } else if (role === 'employee' && reqInviteCode) {
       const employer = await User.findOne({ inviteCode: reqInviteCode, role: 'employer' });
       if (employer) {
           assignedCompanyName = employer.companyName;
       } else {
           return res.status(400).json({ error: 'Invalid invite code' });
       }
    }
    
    const user = new User({ email, password: hashPassword(password), role, name, companyName: assignedCompanyName, title, inviteCode: newInviteCode });
    await user.save();
    
    const token = jwt.sign({ id: user._id, role: user.role, name: user.name, companyName: user.companyName, title: user.title, inviteCode: user.inviteCode }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
    res.json({ token, user: { id: user._id, email: user.email, role: user.role, name: user.name, companyName: user.companyName, title: user.title, inviteCode: user.inviteCode } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    if (user.password !== hashPassword(password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.role === 'employer' && !user.inviteCode) {
      user.inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();
      await user.save();
    }
    
    const token = jwt.sign({ id: user._id, role: user.role, name: user.name, companyName: user.companyName, title: user.title, inviteCode: user.inviteCode }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
    res.json({ token, user: { id: user._id, email: user.email, role: user.role, name: user.name, companyName: user.companyName, title: user.title, inviteCode: user.inviteCode } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- TIMESHEET ROUTES ---
app.get('/api/timesheets', async (req, res) => {
  try {
    const { userId } = req.query;
    let query = {};
    if (userId) query.userId = userId;
    
    const timesheets = await Timesheet.find(query).populate('userId', 'name email role payRate');
    const mapped = timesheets.map(t => ({
      id: t._id,
      consultantId: t.userId._id,
      consultantName: t.userId.name,
      payRate: t.userId.payRate,
      week: t.week,
      hours: t.hours,
      status: t.status,
      clientApproved: t.clientApproved,
      fileUrl: t.fileUrl,
      clientProject: t.clientProject,
      uploadedAt: t.submittedOn ? t.submittedOn.toISOString().split('T')[0] : undefined
    }));
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/timesheets', upload.single('file'), async (req, res) => {
  try {
    const { userId, week, hours, clientProject } = req.body;
    let fileUrl = null;
    let fileName = null;
    
    if (req.file) {
      fileUrl = req.file.location || ('/uploads/' + req.file.filename);
      fileName = req.file.originalname;
    }

    const ts = new Timesheet({
      userId, week, hours, clientProject, fileName, fileUrl,
      status: 'Submitted',
      submittedOn: new Date()
    });
    await ts.save();
    res.json(ts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5001;

// GET /api/consultants
app.get('/api/consultants', async (req, res) => {
  try {
    const { companyName } = req.query;
    const query = { role: 'employee' };
    if (companyName) query.companyName = companyName;
    const consultants = await User.find(query).select('-password');
    res.json(consultants);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/consultants/:id
app.put('/api/consultants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { client, payRate, experience, location, title } = req.body;
    const updateData = {};
    if (client !== undefined) updateData.client = client;
    if (payRate !== undefined) updateData.payRate = payRate;
    if (experience !== undefined) updateData.experience = experience;
    if (location !== undefined) updateData.location = location;
    if (title !== undefined) updateData.title = title;
    const updated = await User.findByIdAndUpdate(id, updateData, { new: true }).select('-password');
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/timesheets/:id
app.delete('/api/timesheets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Timesheet.findByIdAndDelete(id);
    res.json({ message: 'Timesheet deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/timesheets/:id/approve
app.put('/api/timesheets/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const ts = await Timesheet.findByIdAndUpdate(id, { status: 'Approved', clientApproved: true }, { new: true });
    res.json(ts);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});


// --- INVOICE ROUTES ---
app.post('/api/invoices/generate', async (req, res) => {
  try {
    const { timesheetIds } = req.body;
    if (!timesheetIds || !timesheetIds.length) return res.status(400).json({ error: 'No timesheets provided' });
    
    const Invoice = require('./models/Invoice');
    const Timesheet = require('./models/Timesheet');
    const timesheets = await Timesheet.find({ _id: { $in: timesheetIds } }).populate('userId');
    if (!timesheets.length) return res.status(404).json({ error: 'Timesheets not found' });
    
    const consultant = timesheets[0].userId;
    const totalHours = timesheets.reduce((sum, ts) => sum + (ts.hours || 0), 0);
    const rate = consultant.payRate || 0;
    const amount = totalHours * rate;
    
    const invoice = new Invoice({
      consultantId: consultant._id,
      consultantName: consultant.name,
      vendorName: timesheets[0].clientProject || 'Direct Client',
      hours: totalHours,
      rate: rate,
      amount: amount,
      status: 'Pending',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
      timesheetIds: timesheetIds
    });
    
    await invoice.save();
    
    // Mark timesheets as invoiced
    await Timesheet.updateMany({ _id: { $in: timesheetIds } }, { $set: { status: 'Invoiced' } });
    
    res.json(invoice);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/invoices', async (req, res) => {
  try {
    const Invoice = require('./models/Invoice');
    const invoices = await Invoice.find().sort({ createdAt: -1 });
    const mapped = invoices.map(i => ({
      id: i._id,
      consultantName: i.consultantName,
      vendorName: i.vendorName,
      hours: i.hours,
      rate: i.rate,
      amount: i.amount,
      status: i.status,
      dueDate: i.dueDate ? i.dueDate.toISOString().split('T')[0] : '',
      issuedDate: i.issuedDate ? i.issuedDate.toISOString().split('T')[0] : '',
      netTerms: i.netTerms
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 5000 // fail fast if unable to connect
})
  .then(() => {
    console.log('MongoDB connected successfully');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Fatal: Failed to connect to MongoDB. Check your connection string and IP whitelist in Atlas.');
    console.error(err);
    process.exit(1);
  });
