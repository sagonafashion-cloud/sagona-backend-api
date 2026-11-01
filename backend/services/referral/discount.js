// Pure referral-discount maths. Everything is in integer PAISE; no I/O.
// The server is the only place a discount is ever computed.

export const roundHalfUp = (n) => Math.floor(n + 0.5);

/**
 * Compute the order-level referral discount and allocate it to cart lines.
 *
 * @param {Array<{index:number, unitPaise:number, qty:number, category?:string, onSale?:boolean}>} lines
 * @param {object} rule  { discountType:'percent'|'flat', discountValue (bps | paise),
 *                         discountCapPaise?, minOrderPaise?, categoryScope?:string[], excludeSaleItems?:boolean }
 * @returns {{ discountPaise:number, lineDiscountsPaise:Record<number,number>, reason?:string }}
 */
export function computeReferralDiscount(lines, rule) {
  const none = (reason) => ({ discountPaise: 0, lineDiscountsPaise: {}, reason });
  if (!Array.isArray(lines) || !lines.length) return none('empty_cart');

  const lineTotal = (l) => l.unitPaise * l.qty;
  const cartTotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  if (rule.minOrderPaise && cartTotal < rule.minOrderPaise) return none('below_minimum');

  const scope = Array.isArray(rule.categoryScope) ? rule.categoryScope : [];
  const eligible = lines.filter((l) =>
    (!scope.length || scope.includes(l.category)) &&
    !(rule.excludeSaleItems && l.onSale));
  const eligibleTotal = eligible.reduce((s, l) => s + lineTotal(l), 0);
  if (eligibleTotal <= 0) return none('no_eligible_items');

  let discount = rule.discountType === 'percent'
    ? roundHalfUp((eligibleTotal * rule.discountValue) / 10000)
    : rule.discountValue;
  if (rule.discountCapPaise > 0) discount = Math.min(discount, rule.discountCapPaise);
  discount = Math.min(discount, eligibleTotal);          // never more than the eligible value
  if (discount <= 0) return none('zero_discount');

  // Largest-remainder allocation: line shares sum EXACTLY to the order discount (no stray paise).
  const shares = eligible.map((l) => {
    const exact = (discount * lineTotal(l)) / eligibleTotal;
    return { index: l.index, cap: lineTotal(l), floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let remainder = discount - shares.reduce((s, x) => s + x.floor, 0);
  [...shares].sort((a, b) => b.frac - a.frac || a.index - b.index).forEach((x) => {
    if (remainder > 0 && x.floor < x.cap) { x.floor += 1; remainder -= 1; }
  });

  const lineDiscountsPaise = {};
  for (const x of shares) if (x.floor > 0) lineDiscountsPaise[x.index] = x.floor;
  return { discountPaise: discount, lineDiscountsPaise };
}

/**
 * Optional GST-slab re-evaluation on the DISCOUNTED per-piece value (apparel slabs
 * depend on the transaction value per piece). Ships OFF (setting `reevaluate_gst_slab`);
 * thresholds and rates are settings, never hard-coded. Returns the slab to use.
 */
export function reevaluateSlab({ gstSlab, category, chargedPaise, qty }, s) {
  if (!s?.reevaluate_gst_slab) return gstSlab;
  if (!['kids', 'women', 'men'].includes(category)) return gstSlab;           // apparel only
  if (![s.slab_low_rate, s.slab_high_rate].includes(Number(gstSlab))) return gstSlab;
  const perPiece = chargedPaise / Math.max(1, qty);
  return perPiece <= s.slab_threshold_paise ? s.slab_low_rate : s.slab_high_rate;
}

/** Customer-identity keys for per-customer limits: salted hashes of normalised phone / email. */
import crypto from 'crypto';
export function customerKeys({ phone, email } = {}) {
  const salt = process.env.JWT_SECRET || 'sagona';
  const h = (kind, v) => crypto.createHmac('sha256', salt).update(`${kind}:${v}`).digest('hex').slice(0, 32);
  const keys = [];
  const p = String(phone || '').replace(/\D/g, '').slice(-10);
  const e = String(email || '').trim().toLowerCase();
  if (p.length === 10) keys.push(h('phone', p));
  if (e) keys.push(h('email', e));
  return keys;
}
