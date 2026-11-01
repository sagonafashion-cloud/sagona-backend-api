import ReferralCode from '../../models/referral/ReferralCode.js';
import CommissionRate from '../../models/referral/CommissionRate.js';
import OrderReferral from '../../models/referral/OrderReferral.js';
import OrderReferralLine from '../../models/referral/OrderReferralLine.js';
import CommissionLedger from '../../models/referral/CommissionLedger.js';
import { getSettings } from './settings.js';
import { pickRate } from './rates.js';
import { commissionBasePaise, commissionPaise, lineTaxPaise } from './commission.js';
import { pendingAccrualEntry } from './ledger.js';
import { ReferralError } from './applyReferral.js';

const toPaise = (r) => Math.round(Number(r) * 100);

/**
 * Persists the referral snapshot for a freshly created order. MUST be called inside
 * the same Mongo transaction as Order.create, so an order never exists half-recorded:
 * if anything here throws, the whole order (and its stock reservation) rolls back.
 *
 * Writes: OrderReferral, OrderReferralLine (one per item), CommissionLedger
 * (accrual_pending per line), and increments the code's usage counter atomically.
 */
export async function recordReferral({ order, referral, itemMeta = [], session, now = new Date() }) {
  const settings = await getSettings();

  // 1. Usage counter. A limited code is incremented with a conditional update, so two
  //    simultaneous orders can never exceed the limit. A snapshot order (already paid) is
  //    always honoured, so it uses an unconditional increment.
  const filter = { _id: referral.codeId };
  if (referral.limited && !referral.honorSnapshot) filter.$expr = { $lt: ['$timesUsed', '$usageLimitTotal'] };
  const bumped = await ReferralCode.updateOne(filter, { $inc: { timesUsed: 1 } }, { session });
  if (!bumped.modifiedCount) throw new ReferralError(409, 'limit_reached');

  // 2. Rates effective on the order date (promoter override > category > default).
  const rateRows = await CommissionRate.find({
    $or: [{ promoterId: { $exists: false } }, { promoterId: referral.promoterId }]
  }).lean();

  // 3. Per-line snapshot.
  const lines = [];
  let commissionTotal = 0;
  let noRate = false;
  (order.items || []).forEach((it, i) => {
    const grossPaise = toPaise(it.unitPrice) * it.qty;
    const discPaise = referral.lineDiscountsPaise[i] || 0;
    const chargedPaise = grossPaise - discPaise;
    const { taxablePaise, gstPaise } = lineTaxPaise({ chargedPaise, gstSlab: it.gstSlab, taxType: order.taxType });
    const category = itemMeta[i]?.category;
    const hit = pickRate(rateRows, { category, promoterId: String(referral.promoterId), at: order.createdAt || now });
    if (!hit) noRate = true;
    const base = commissionBasePaise({ rule: settings.commission_base, listPaise: grossPaise, chargedPaise, gstSlab: it.gstSlab, taxType: order.taxType });
    const commission = hit ? commissionPaise(base, hit.rateBps) : 0;
    commissionTotal += commission;
    lines.push({
      itemIndex: i, productId: it.productId, category, qty: it.qty, hsn: it.hsnCode, gstRate: it.gstSlab, taxType: order.taxType,
      lineGrossPaise: grossPaise, lineDiscountPaise: discPaise, lineChargedPaise: chargedPaise,
      lineTaxablePaise: taxablePaise, lineGstPaise: gstPaise,
      commissionBaseRule: settings.commission_base, commissionBasePaise: base,
      commissionRateBps: hit ? hit.rateBps : 0, commissionRateId: hit ? hit.source._id : undefined,
      commissionPaise: commission
    });
  });

  // 4. Order-level row, then the lines, then the ledger.
  const [ref] = await OrderReferral.create([{
    orderId: order._id, orderNumber: order.orderNumber,
    referralCodeId: referral.codeId, codeText: referral.code, promoterId: referral.promoterId,
    discountType: referral.discountType, discountValue: referral.discountValue,
    discountTotalPaise: referral.discountPaise, commissionTotalPaise: commissionTotal,
    commissionBaseRule: settings.commission_base, customerKeys: referral.customerKeys,
    flags: { ...(noRate ? { noRate: true } : {}), ...(referral.slabChanges?.length ? { slabReevaluated: referral.slabChanges } : {}) }
  }], { session });

  const lineDocs = await OrderReferralLine.create(
    lines.map((l) => ({ ...l, orderReferralId: ref._id, orderId: order._id, promoterId: referral.promoterId })),
    { session, ordered: true }
  );

  const entries = lineDocs.filter((l) => l.commissionPaise > 0).map((l) => pendingAccrualEntry(l, now));
  if (entries.length) await CommissionLedger.create(entries, { session, ordered: true });

  return { referralId: ref._id, commissionTotalPaise: commissionTotal, noRate };
}
