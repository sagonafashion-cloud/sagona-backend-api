import ReferralCode from '../../models/referral/ReferralCode.js';
import Promoter from '../../models/referral/Promoter.js';
import OrderReferral from '../../models/referral/OrderReferral.js';
import { getSettings, isProgrammeEnabled } from './settings.js';
import { computeReferralDiscount, reevaluateSlab, customerKeys } from './discount.js';
import { normalizeCode } from '../../utils/referralValidators.js';

// Customer-facing message is ALWAYS this one string: it must not reveal whether a
// code exists, expired, hit a limit, or belongs to the customer. The precise reason
// is logged for admins (reasonLog), never returned.
export const GENERIC_MESSAGE = 'This code is not valid for this order';

export class ReferralError extends Error {
  constructor(status = 400, reason = 'invalid') {
    super(GENERIC_MESSAGE);
    this.statusCode = status;
    this.referralInvalid = true;
    this.reason = reason;
  }
}

const rupees = (paise) => Math.round(paise) / 100;
const toPaise = (rupeeAmount) => Math.round(Number(rupeeAmount) * 100);

/**
 * Applies a referral code (or a previously agreed snapshot) to the enriched order
 * lines produced by computeOrderTotals. Mutates each item's `referralDiscount`
 * (rupees) and, only when the slab setting is on, its `gstSlab`. Returns the context
 * that createOrder later persists (see recordReferral.js).
 *
 * @param items  enrichedItems (with non-enumerable _category / _onSale meta)
 * @param opts   { code?, snapshot?, customer:{phone,email}, mode:'validate'|'order' }
 */
export async function applyReferral(items, opts = {}) {
  if (!opts.snapshot && !(await isProgrammeEnabled())) throw new ReferralError(404, 'programme_off');
  const settings = await getSettings();
  const failStatus = opts.mode === 'order' ? 409 : 400;
  const log = (reason, extra = {}) => console.warn('[referral] rejected:', reason, extra);

  /* ── resolve the code row ── */
  let code;
  if (opts.snapshot) {
    code = await ReferralCode.findById(opts.snapshot.codeId);
    if (!code) { log('snapshot_code_missing', { codeId: String(opts.snapshot.codeId) }); throw new ReferralError(failStatus, 'code_missing'); }
  } else {
    const text = normalizeCode(opts.code);
    code = text ? await ReferralCode.findOne({ code: text }) : null;
    if (!code) { log('unknown_code'); throw new ReferralError(failStatus, 'unknown'); }
  }
  const promoter = await Promoter.findById(code.promoterId).select('status mobile email');
  const now = new Date();

  /* ── eligibility (skipped for a snapshot: the shopper already paid the agreed amount) ── */
  const keys = customerKeys(opts.customer);
  if (!opts.snapshot) {
    if (code.status !== 'active') { log('code_not_active', { code: code.code, status: code.status }); throw new ReferralError(failStatus, 'inactive'); }
    if (!promoter || promoter.status !== 'active') { log('promoter_not_active', { code: code.code }); throw new ReferralError(failStatus, 'promoter_inactive'); }
    if (code.validFrom && now < code.validFrom) { log('not_yet_valid', { code: code.code }); throw new ReferralError(failStatus, 'not_started'); }
    if (code.validTo && now > code.validTo) { log('expired', { code: code.code }); throw new ReferralError(failStatus, 'expired'); }
    if (code.usageLimitTotal > 0 && code.timesUsed >= code.usageLimitTotal) { log('usage_limit', { code: code.code }); throw new ReferralError(failStatus, 'limit_total'); }

    // Self-referral: the buyer is the promoter.
    const cPhone = String(opts.customer?.phone || '').replace(/\D/g, '').slice(-10);
    const cEmail = String(opts.customer?.email || '').trim().toLowerCase();
    if ((cPhone && cPhone === promoter.mobile) || (cEmail && promoter.email && cEmail === promoter.email)) {
      log('self_referral', { code: code.code }); throw new ReferralError(failStatus, 'self_referral');
    }
    if (code.usageLimitPerCustomer > 0 && keys.length) {
      const used = await OrderReferral.countDocuments({ referralCodeId: code._id, status: 'applied', customerKeys: { $in: keys } });
      if (used >= code.usageLimitPerCustomer) { log('usage_limit_customer', { code: code.code }); throw new ReferralError(failStatus, 'limit_customer'); }
    }
  }

  /* ── discount ── */
  let lineDiscountsPaise;
  let discountPaise;
  if (opts.snapshot) {
    const snap = opts.snapshot;
    if (!Array.isArray(snap.lineDiscountsPaise) || snap.lineDiscountsPaise.length !== items.length) {
      log('snapshot_shape_mismatch'); throw new ReferralError(failStatus, 'snapshot_mismatch');
    }
    lineDiscountsPaise = {};
    snap.lineDiscountsPaise.forEach((p, i) => { if (p > 0) lineDiscountsPaise[i] = p; });
    discountPaise = snap.discountPaise;
  } else {
    const lines = items.map((it, i) => ({
      index: i, unitPaise: toPaise(it.unitPrice), qty: it.qty, category: it._category, onSale: !!it._onSale
    }));
    const r = computeReferralDiscount(lines, code);
    if (r.discountPaise <= 0) { log('no_discount', { code: code.code, reason: r.reason }); throw new ReferralError(failStatus, r.reason || 'no_discount'); }
    lineDiscountsPaise = r.lineDiscountsPaise;
    discountPaise = r.discountPaise;
  }

  /* ── write the per-line discount onto the items (rupees) ── */
  const slabChanges = [];
  items.forEach((it, i) => {
    const d = lineDiscountsPaise[i] || 0;
    if (d > 0) it.referralDiscount = rupees(d);
    if (settings.reevaluate_gst_slab) {
      const chargedPaise = toPaise(it.unitPrice) * it.qty - d;
      const slab = reevaluateSlab({ gstSlab: it.gstSlab, category: it._category, chargedPaise, qty: it.qty }, settings);
      if (slab !== it.gstSlab) { slabChanges.push({ i, from: it.gstSlab, to: slab }); it.gstSlab = slab; }
    }
  });

  return {
    codeId: code._id, code: code.code, promoterId: code.promoterId,
    discountType: code.discountType, discountValue: code.discountValue,
    discountPaise, lineDiscountsPaise: items.map((_, i) => lineDiscountsPaise[i] || 0),
    customerKeys: keys, honorSnapshot: !!opts.snapshot, slabChanges,
    limited: code.usageLimitTotal > 0, promoterMobile: promoter?.mobile
  };
}
