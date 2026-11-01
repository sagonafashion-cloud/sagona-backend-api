import mongoose from 'mongoose';

// One-time login codes for the promoter portal. Only a hash is stored; rows expire on their own.
const schema = new mongoose.Schema({
  promoterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promoter', required: true, index: true },
  hash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  used: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: { createdAt: true, updatedAt: false } });
export default mongoose.models.PromoterLoginCode || mongoose.model('PromoterLoginCode', schema);
