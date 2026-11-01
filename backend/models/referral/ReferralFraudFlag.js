import mongoose from 'mongoose';

// A suspicious-activity flag raised by the automated rules. Order-level flags put the
// order's commission on HOLD (never becomes payable) until an admin clears or confirms it.
// `key` makes raising a flag idempotent: the same rule never flags the same order twice.
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  promoterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promoter', required: true, index: true },
  orderReferralId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderReferral', index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  orderNumber: String,
  rule: { type: String, required: true },
  severity: { type: String, enum: ['low', 'medium', 'high'], required: true },
  detail: { type: String, maxlength: 400 },
  status: { type: String, enum: ['open', 'cleared', 'confirmed'], default: 'open', index: true },
  resolvedBy: String, resolvedAt: Date, resolutionNote: { type: String, maxlength: 400 }
}, { timestamps: true });

export default mongoose.models.ReferralFraudFlag || mongoose.model('ReferralFraudFlag', schema);
