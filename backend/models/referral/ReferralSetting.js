import mongoose from 'mongoose';
import { makeAppendOnly } from './appendOnly.js';

// Insert-only key/value history. The current value of a key is its newest row.
const referralSettingSchema = new mongoose.Schema({
  key:   { type: String, required: true, index: true },
  value: { type: mongoose.Schema.Types.Mixed },
  setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }
}, { timestamps: { createdAt: true, updatedAt: false } });

referralSettingSchema.index({ key: 1, createdAt: -1 });
makeAppendOnly(referralSettingSchema, 'ReferralSetting');

export default mongoose.models.ReferralSetting || mongoose.model('ReferralSetting', referralSettingSchema);
