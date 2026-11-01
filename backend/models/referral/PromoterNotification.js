import mongoose from 'mongoose';

// Outbox for emails to promoters. `key` is unique per underlying event, so a restart or a
// second server instance can never send the same event twice. `data` holds amounts only:
// never customer details.
const schema = new mongoose.Schema({
  promoterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promoter', required: true, index: true },
  type: { type: String, enum: ['order_referred', 'commission_payable', 'commission_reversed', 'payout_paid'], required: true },
  key: { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  error: { type: String, maxlength: 200 },
  sentAt: Date
}, { timestamps: true });
export default mongoose.models.PromoterNotification || mongoose.model('PromoterNotification', schema);
