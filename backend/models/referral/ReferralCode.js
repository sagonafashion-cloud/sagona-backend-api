import mongoose from 'mongoose';

// Money units in the referral module: paise (integers). Percentages: basis points
// (1% = 100 bps). The admin UI converts from rupees / percent.
const referralCodeSchema = new mongoose.Schema({
  code:       { type: String, required: true, unique: true, uppercase: true, trim: true },
  promoterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promoter', required: true, index: true },
  status:     { type: String, enum: ['active', 'paused', 'expired'], default: 'active' },
  pausedReason: { type: String },                     // e.g. "promoter_suspended"

  discountType:  { type: String, enum: ['percent', 'flat'], required: true },
  discountValue: { type: Number, required: true, min: 1 },   // bps if percent, paise if flat
  discountCapPaise: { type: Number, min: 0 },                // max discount per order
  minOrderPaise:    { type: Number, min: 0, default: 0 },

  validFrom: { type: Date },
  validTo:   { type: Date },
  usageLimitTotal:       { type: Number, min: 0 },           // undefined / 0 = unlimited
  usageLimitPerCustomer: { type: Number, min: 0 },

  categoryScope:    [{ type: String, enum: ['kids', 'women', 'men', 'accessories'] }],  // empty = all
  excludeSaleItems: { type: Boolean, default: true },
  combinable:       { type: Boolean, default: false },

  timesUsed: { type: Number, default: 0 },      // denormalised counter (source of truth: order_referrals)
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }
}, { timestamps: true });

referralCodeSchema.index({ promoterId: 1, status: 1 });

export default mongoose.models.ReferralCode || mongoose.model('ReferralCode', referralCodeSchema);
