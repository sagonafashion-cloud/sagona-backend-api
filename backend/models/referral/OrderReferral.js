import mongoose from 'mongoose';

// One row per order that used a referral code. Everything here is a SNAPSHOT: later
// edits to the code, the promoter or the rates never change a past order.
const orderReferralSchema = new mongoose.Schema({
  orderId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  orderNumber:   { type: String, index: true },
  referralCodeId:{ type: mongoose.Schema.Types.ObjectId, ref: 'ReferralCode', required: true },
  codeText:      { type: String, required: true },
  promoterId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Promoter', required: true },
  discountType:  { type: String },
  discountValue: { type: Number },
  discountTotalPaise: { type: Number, required: true },
  commissionTotalPaise: { type: Number, default: 0 },
  commissionBaseRule: { type: String },
  status:        { type: String, enum: ['applied', 'void'], default: 'applied' },
  voidedAt:      { type: Date },
  customerKeys:  [{ type: String }],            // salted hashes, for per-customer limits
  flags:         { type: mongoose.Schema.Types.Mixed, default: {} }   // e.g. { noRate:true }
}, { timestamps: true });

orderReferralSchema.index({ promoterId: 1, createdAt: -1 });
orderReferralSchema.index({ referralCodeId: 1, customerKeys: 1 });
orderReferralSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.OrderReferral || mongoose.model('OrderReferral', orderReferralSchema);
