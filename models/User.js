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
  location: { type: String, default: 'Remote' }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
