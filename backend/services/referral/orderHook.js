import PendingCheckout from '../../models/PendingCheckout.js';
import { isProgrammeEnabled, envEnabled } from './settings.js';

// Thin glue between the existing order/payment controllers and the referral module.
// Every function returns `undefined` when there is nothing referral-related to do, so
// with the programme off (or no code supplied) the legacy code path is untouched.

const customerOf = (req) => ({
  phone: req.body?.shippingAddress?.phone || req.user?.phone,
  email: req.body?.email || req.body?.shippingAddress?.email || req.user?.email
});

/** For POST /payment/create-order: validate a code typed at checkout. */
export async function referralOptsForPaymentOrder(req) {
  if (!envEnabled()) return undefined;            // module switched off: legacy path only
  const code = req.body?.referralCode;
  if (!code || !(await isProgrammeEnabled())) return undefined;
  return { referral: { code, customer: customerOf(req), mode: 'order' } };
}

/**
 * For POST /orders. Online: honour exactly what was agreed at create-order time (the
 * shopper already paid that amount); a code typed only now is ignored so the amount
 * always matches what Razorpay captured. COD: validate the code now.
 */
export async function referralOptsForOrder(req, razorpayOrderId) {
  if (!envEnabled()) return undefined;            // module switched off: legacy path only
  const method = req.body?.payment?.method || 'COD';
  if (method === 'ONLINE') {
    if (!razorpayOrderId) return undefined;
    const pending = await PendingCheckout.findOne({ razorpayOrderId }).select('referral').lean();
    if (!pending?.referral?.codeId) return undefined;
    return { referral: { snapshot: pending.referral, customer: customerOf(req), mode: 'order' } };
  }
  const code = req.body?.referralCode;
  if (!code || !(await isProgrammeEnabled())) return undefined;
  return { referral: { code, customer: customerOf(req), mode: 'order' } };
}

/** What create-order stores so the order can later be built with the same discount. */
export const snapshotOf = (referral) => referral && ({
  codeId: referral.codeId, code: referral.code,
  discountPaise: referral.discountPaise, lineDiscountsPaise: referral.lineDiscountsPaise
});

export const itemMetaOf = (enrichedItems) => enrichedItems.map((i) => ({ category: i._category }));
