import mongoose from 'mongoose';
import { makeAppendOnly } from './appendOnly.js';

// Append-only commission ledger. Amounts are signed paise. Two buckets keep the
// books honest: SUM(amount) per promoter per bucket is always the current balance.
//   pending : earned, return window not over yet (NOT payable)
//   payable : eligible for the next payout (after the return window)
// Lifecycle entry types:
//   accrual_pending  (+, pending)   order placed
//   release_pending  (-, pending)   moves it out of pending ...
//   accrual_eligible (+, payable)   ... and into payable once the window passes
//   reversal_cancel / reversal_return / reversal_fraud (-, pending or payable)
//   adjustment (+/-)  manual, super_admin only, reason mandatory
//   payout (-, payable)  added in Phase 3
const ledgerSchema = new mongoose.Schema({
  promoterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promoter', required: true },
  orderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  orderReferralLineId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderReferralLine' },
  entryType:  { type: String, required: true, enum: [
    'accrual_pending', 'release_pending', 'accrual_eligible',
    'reversal_cancel', 'reversal_return', 'reversal_fraud', 'adjustment', 'payout'] },
  bucket:     { type: String, required: true, enum: ['pending', 'payable'] },
  amountPaise:{ type: Number, required: true },
  reason:     { type: String, maxlength: 300 },
  eventAt:    { type: Date, required: true },
  actor:      { type: String },                    // 'system' or admin id
  idempotencyKey: { type: String, required: true, unique: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

ledgerSchema.index({ promoterId: 1, eventAt: -1 });
ledgerSchema.index({ orderReferralLineId: 1 });
ledgerSchema.index({ orderId: 1 });
makeAppendOnly(ledgerSchema, 'CommissionLedger');

export default mongoose.models.CommissionLedger || mongoose.model('CommissionLedger', ledgerSchema);
