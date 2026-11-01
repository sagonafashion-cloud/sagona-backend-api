import { computeOrderTotals } from '../utils/orderCalculator.js';
import { isProgrammeEnabled } from '../services/referral/settings.js';
import { ReferralError, GENERIC_MESSAGE } from '../services/referral/applyReferral.js';

// POST /api/referral/validate
// The browser sends the cart and a code; the server recomputes everything and answers
// with the discount and the new totals. Errors are deliberately generic so codes
// cannot be probed (exists / expired / limit reached / yours all look the same).
export async function validateReferral(req, res) {
  try {
    if (!(await isProgrammeEnabled())) {
      return res.status(404).json({ success: false, message: 'Referral codes are not available' });
    }
    const { code, items, shippingAddress } = req.body || {};
    if (typeof code !== 'string' || !code.trim() || code.length > 40 ||
        !Array.isArray(items) || !items.length || items.length > 50 ||
        items.some((i) => !i || typeof i.productId !== 'string' || !Number.isInteger(Number(i.qty ?? i.quantity)))) {
      return res.status(400).json({ success: false, message: GENERIC_MESSAGE });
    }
    const cleanItems = items.map((i) => ({
      productId: i.productId, qty: Number(i.qty ?? i.quantity), size: i.size, colour: i.colour, storeId: i.storeId, sku: i.sku
    }));
    const customer = { phone: shippingAddress?.phone || req.body.phone, email: req.body.email };

    const { billing, referral } = await computeOrderTotals(cleanItems, shippingAddress || {}, {
      referral: { code, customer, mode: 'validate' }
    });
    res.set('Cache-Control', 'no-store').json({
      success: true,
      data: {
        code: referral.code,
        discount: billing.referralDiscount,
        billing: {
          subtotal: billing.subtotal, referralDiscount: billing.referralDiscount,
          shippingCharge: billing.shippingCharge, taxableAmount: billing.taxableAmount,
          grandTotal: billing.grandTotal
        }
      }
    });
  } catch (err) {
    if (err instanceof ReferralError) return res.status(400).json({ success: false, message: GENERIC_MESSAGE });
    // Cart problems (unknown product, stock, quantity) keep the existing messages.
    if (err.statusCode && err.statusCode < 500) return res.status(err.statusCode).json({ success: false, message: err.message });
    console.error('referral validate:', err.message);
    res.status(500).json({ success: false, message: 'Could not check the code right now' });
  }
}
