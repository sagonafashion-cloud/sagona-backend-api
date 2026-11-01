import { evaluateOrderRules, evaluatePromoterRules } from './fraud.js';

const DAY = 86400000;
const dup = (e) => e?.code === 11000;

/**
 * Scans one referred order once (flags.fraudScanned). Creates idempotent flags and, if any,
 * sets flags.fraudHold so the sweeper never makes the commission payable. Returns true if held.
 * `m` = { Promoter, OrderReferral, ReferralFraudFlag }
 */
export async function scanReferredOrder({ m, ref, order, settings, cache = new Map() }) {
  if (ref.flags?.fraudScanned) return !!ref.flags.fraudHold;
  const pid = String(ref.promoterId);
  if (!cache.has(pid)) cache.set(pid, await m.Promoter.findById(ref.promoterId).select('mobile email address').lean());
  const at = new Date(ref.createdAt);
  const [sameCode24h, customerWithPromoter30d] = await Promise.all([
    m.OrderReferral.countDocuments({ referralCodeId: ref.referralCodeId, createdAt: { $gte: new Date(at - DAY), $lte: at } }),
    (ref.customerKeys || []).length
      ? m.OrderReferral.countDocuments({ promoterId: ref.promoterId, customerKeys: { $in: ref.customerKeys }, status: 'applied', createdAt: { $gte: new Date(at - 30 * DAY), $lte: at } })
      : 0
  ]);
  const hits = evaluateOrderRules({ ref, promoter: cache.get(pid), order, counts: { sameCode24h, customerWithPromoter30d }, settings });
  for (const h of hits) {
    try {
      await m.ReferralFraudFlag.create({
        key: `${ref._id}:${h.rule}`, promoterId: ref.promoterId, orderReferralId: ref._id, orderId: ref.orderId,
        orderNumber: ref.orderNumber, rule: h.rule, severity: h.severity, detail: h.detail
      });
    } catch (e) { if (!dup(e)) throw e; }
  }
  const held = hits.length > 0;
  await m.OrderReferral.updateOne({ _id: ref._id }, { $set: { 'flags.fraudScanned': true, ...(held ? { 'flags.fraudHold': true } : {}) } });
  ref.flags = { ...(ref.flags || {}), fraudScanned: true, ...(held ? { fraudHold: true } : {}) };
  return held;
}

/** Monthly promoter-level return-rate alerts. `m` adds Order. */
export async function scanPromoters({ m, settings, now = new Date() }) {
  const since = new Date(now - 30 * DAY);
  const refs = await m.OrderReferral.find({ createdAt: { $gte: since } }).select('promoterId orderId').lean();
  if (!refs.length) return 0;
  const orders = await m.Order.find({ _id: { $in: refs.map((r) => r.orderId) } }).select('status').lean();
  const bad = new Set(orders.filter((o) => ['cancelled', 'returned'].includes(o.status)).map((o) => String(o._id)));
  const by = new Map();
  for (const r of refs) {
    const k = String(r.promoterId); const v = by.get(k) || { n: 0, bad: 0 };
    v.n++; if (bad.has(String(r.orderId))) v.bad++; by.set(k, v);
  }
  let raised = 0;
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  for (const [pid, v] of by) {
    for (const h of evaluatePromoterRules({ orders30d: v.n, badOrders30d: v.bad, settings })) {
      try {
        await m.ReferralFraudFlag.create({ key: `promoter:${pid}:${h.rule}:${ym}`, promoterId: pid, rule: h.rule, severity: h.severity, detail: h.detail });
        raised++;
      } catch (e) { if (!dup(e)) throw e; }
    }
  }
  return raised;
}
