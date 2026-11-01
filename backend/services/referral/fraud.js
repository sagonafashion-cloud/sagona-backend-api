import { customerKeys } from './discount.js';

// Pure fraud rules. They only RAISE flags for a human to review; nothing here blocks a
// shopper at checkout (a false positive must never cost a real customer an order).
export const REPEAT_CUSTOMER_ORDERS_30D = 3;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * @param ref       OrderReferral {customerKeys}
 * @param promoter  {mobile,email,address:{line1,pincode}}
 * @param order     {shippingAddress:{phone,line1,pincode}}
 * @param counts    { sameCode24h, customerWithPromoter30d } (include this order)
 */
export function evaluateOrderRules({ ref, promoter, order, counts = {}, settings }) {
  const out = [];
  const p = promoter || {};
  const sa = order?.shippingAddress || {};

  const promoterKeys = new Set(customerKeys({ phone: p.mobile, email: p.email }));
  const orderKeys = [...(ref?.customerKeys || []), ...customerKeys({ phone: sa.phone })];
  if (orderKeys.some((k) => promoterKeys.has(k))) {
    out.push({ rule: 'self_referral', severity: 'high', detail: 'Buyer phone or email matches the promoter' });
  }

  const pa = p.address || {};
  if (pa.line1 && pa.pincode && sa.line1 && sa.pincode && norm(pa.pincode) === norm(sa.pincode) && norm(pa.line1) === norm(sa.line1)) {
    out.push({ rule: 'address_match', severity: 'high', detail: 'Delivery address is the promoter\'s own address' });
  }

  if (settings && counts.sameCode24h > settings.fraud_velocity_orders_24h) {
    out.push({ rule: 'velocity', severity: 'medium', detail: `${counts.sameCode24h} orders with this code within 24 hours (limit ${settings.fraud_velocity_orders_24h})` });
  }

  if (counts.customerWithPromoter30d >= REPEAT_CUSTOMER_ORDERS_30D) {
    out.push({ rule: 'repeat_customer', severity: 'medium', detail: `Same buyer used this promoter's codes ${counts.customerWithPromoter30d} times in 30 days` });
  }
  return out;
}

/** Promoter-level alert: unusually high cancel/return share. Does not hold individual orders. */
export function evaluatePromoterRules({ orders30d, badOrders30d, settings, minOrders = 5 }) {
  if (orders30d < minOrders) return [];
  const pct = (badOrders30d / orders30d) * 100;
  return pct >= settings.fraud_return_rate_alert_pct
    ? [{ rule: 'return_rate', severity: 'medium', detail: `${badOrders30d} of ${orders30d} orders cancelled/returned in 30 days (${pct.toFixed(0)}%)` }]
    : [];
}
