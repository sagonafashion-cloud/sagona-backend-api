import mongoose from 'mongoose';
import { makeAppendOnly } from './appendOnly.js';

// Per-line snapshot: discount, tax split, the commission base/rate/amount and the
// category, exactly as they were when the order was placed. Insert-only.
const lineSchema = new mongoose.Schema({
  orderReferralId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderReferral', required: true, index: true },
  orderId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  promoterId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Promoter', required: true },
  itemIndex:   { type: Number, required: true },
  productId:   { type: mongoose.Schema.Types.ObjectId },
  category:    { type: String },
  qty:         { type: Number, required: true },
  hsn:         { type: String },
  gstRate:     { type: Number },
  taxType:     { type: String },
  lineGrossPaise:    { type: Number, required: true },   // list value, GST-inclusive
  lineDiscountPaise: { type: Number, required: true },
  lineChargedPaise:  { type: Number, required: true },   // = gross - discount
  lineTaxablePaise:  { type: Number, required: true },   // taxable value after discount (ties to invoice / GST report)
  lineGstPaise:      { type: Number, required: true },
  commissionBaseRule:{ type: String },
  commissionBasePaise:{ type: Number, required: true },
  commissionRateBps: { type: Number, required: true },
  commissionRateId:  { type: mongoose.Schema.Types.ObjectId },   // absent when no rate applied
  commissionPaise:   { type: Number, required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

lineSchema.index({ orderReferralId: 1, itemIndex: 1 }, { unique: true });
makeAppendOnly(lineSchema, 'OrderReferralLine');

export default mongoose.models.OrderReferralLine || mongoose.model('OrderReferralLine', lineSchema);
