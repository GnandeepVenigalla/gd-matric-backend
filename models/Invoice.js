const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  consultantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  consultantName: String,
  vendorName: { type: String, default: 'Direct Client' },
  hours: Number,
  rate: Number,
  amount: Number,
  status: { type: String, enum: ['Paid', 'Pending', 'Overdue'], default: 'Pending' },
  dueDate: Date,
  issuedDate: { type: Date, default: Date.now },
  netTerms: { type: Number, default: 30 },
  timesheetIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Timesheet' }]
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
