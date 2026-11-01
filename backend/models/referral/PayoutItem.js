import mongoose from 'mongoose';

// One promoter's payment inside a batch. Amounts are a snapshot taken when the batch was drafted.
const schema = new mongoose.Schema({
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayoutBatch', required: true, index: true },
  promoterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promoter', required: true, index: true },
  fy: { type: String, required: true },
  voucherNo: { type: String, required: true, unique: true },    // SAG/PO/2026-27/0001 (payout voucher / self-invoice number)
  promoterName: String, panLast4: String, gstinLast4: String, stateCode: String,
  grossPaise: { type: Number, required: true },
  gstPaise: { type: Number, default: 0 }, cgstPaise: { type: Number, default: 0 }, sgstPaise: { type: Number, default: 0 }, igstPaise: { type: Number, default: 0 },
  tdsPaise: { type: Number, default: 0 }, tdsBasePaise: { type: Number, default: 0 }, tdsRateBps: { type: Number, default: 0 }, tdsSection: String,
  netPaise: { type: Number, required: true },
  status: { type: String, enum: ['draft', 'approved', 'paid', 'failed', 'cancelled'], default: 'draft' },
  utr: { type: String, maxlength: 40 },
  paidAt: Date, failureReason: { type: String, maxlength: 300 }
}, { timestamps: true });

schema.index({ promoterId: 1, status: 1 });
schema.index({ fy: 1, promoterId: 1 });

export default mongoose.models.PayoutItem || mongoose.model('PayoutItem', schema);
