const mongoose = require('mongoose');

const timesheetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  week: { type: String, required: true },
  hours: { type: Number, required: true },
  status: { type: String, enum: ['Pending Submission', 'Submitted', 'Pending', 'Approved'], default: 'Submitted' },
  clientApproved: { type: Boolean, default: false },
  clientProject: { type: String },
  fileName: { type: String },
  fileUrl: { type: String },
  submittedOn: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Timesheet', timesheetSchema);
