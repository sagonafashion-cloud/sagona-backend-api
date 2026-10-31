import mongoose from 'mongoose';
import { makeAppendOnly } from './appendOnly.js';

// Insert-only rate history. To change a rate, insert a new row with a later
// effectiveFrom; the rate for an order is whichever row was effective on the order date.
const commissionRateSchema = new mongoose.Schema({
  category:   { type: String, enum: ['kids', 'women', 'men', 'accessories'] },   // absent = all categories
  promoterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promoter' },         // absent = default for everyone
  rateBps:    { type: Number, required: true, min: 0, max: 10000 },
  effectiveFrom: { type: Date, required: true },
  note:       { type: String, maxlength: 300 },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }
}, { timestamps: { createdAt: true, updatedAt: false } });

commissionRateSchema.index({ promoterId: 1, category: 1, effectiveFrom: -1 });
makeAppendOnly(commissionRateSchema, 'CommissionRate');

export default mongoose.models.CommissionRate || mongoose.model('CommissionRate', commissionRateSchema);
