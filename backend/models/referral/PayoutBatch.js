import mongoose from 'mongoose';

// A payout run. Status moves forward only: draft -> approved -> paid (or cancelled).
// Money movement is recorded in the append-only CommissionLedger, never here.
const schema = new mongoose.Schema({
  batchNo: { type: String, required: true, unique: true },     // PB/2026-27/0001
  fy: { type: String, required: true },
  status: { type: String, enum: ['draft', 'approved', 'paid', 'cancelled'], default: 'draft' },
  itemCount: Number, grossPaise: Number, gstPaise: Number, tdsPaise: Number, netPaise: Number,
  note: { type: String, maxlength: 300 },
  createdBy: String, approvedBy: String, approvedAt: Date, paidAt: Date, cancelledBy: String, cancelledAt: Date
}, { timestamps: true });

export default mongoose.models.PayoutBatch || mongoose.model('PayoutBatch', schema);
