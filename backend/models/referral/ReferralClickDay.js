import mongoose from 'mongoose';

// Daily click counter per referral code (privacy friendly: no IPs, no visitor ids stored).
const schema = new mongoose.Schema({
  codeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReferralCode', required: true },
  promoterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promoter', required: true },
  day: { type: String, required: true },          // YYYY-MM-DD (IST)
  clicks: { type: Number, default: 0 }
});
schema.index({ codeId: 1, day: 1 }, { unique: true });
schema.index({ promoterId: 1, day: 1 });
export default mongoose.models.ReferralClickDay || mongoose.model('ReferralClickDay', schema);
