const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['employer', 'employee'], required: true },
  name: { type: String, required: true },
  companyName: { type: String, default: 'GD Matrix' },
  title: { type: String, default: 'User' },
  inviteCode: { type: String },
  client: { type: String, default: 'Bench' },
  payRate: { type: Number, default: 0 },
  experience: { type: String, default: '5 Years' },
  location: { type: String, default: 'Remote' },
  // Recruiter/HR assigned to this consultant. Null → falls back to the company admin.
  recruiterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
