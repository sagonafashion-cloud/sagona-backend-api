import mongoose from 'mongoose';

// Gapless-ish atomic sequence (findOneAndUpdate $inc) for batch and voucher numbers.
const schema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Model = mongoose.models.ReferralCounter || mongoose.model('ReferralCounter', schema);

export async function nextSeq(key, n = 1) {
  const doc = await Model.findOneAndUpdate({ _id: key }, { $inc: { seq: n } }, { upsert: true, new: true });
  return doc.seq;      // last number of the reserved block
}
export default Model;
