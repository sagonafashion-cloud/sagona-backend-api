import mongoose from 'mongoose';
import Promoter from '../models/referral/Promoter.js';
import ReferralCode from '../models/referral/ReferralCode.js';
import OrderReferral from '../models/referral/OrderReferral.js';
import OrderReferralLine from '../models/referral/OrderReferralLine.js';
import CommissionLedger from '../models/referral/CommissionLedger.js';
import PayoutItem from '../models/referral/PayoutItem.js';
import ReferralFraudFlag from '../models/referral/ReferralFraudFlag.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { audit } from '../services/referral/audit.js';
import { fraudReversalEntries } from '../services/referral/ledger.js';
import ReferralClickDay from '../models/referral/ReferralClickDay.js';
import { linkPerformance, liabilityReport, programmeSummary, gstImpact, promoterPerformance, profitReport, reconcile } from '../services/referral/reports.js';
import { toCsv, rupees } from '../services/referral/payout.js';

const isId = (v) => mongoose.isValidObjectId(v);
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (m) => new HttpError(422, m);
const h = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ success: false, message: err.message });
    console.error('[referral report]', err);
    res.status(500).json({ success: false, message: 'Request failed' });
  }
};
const actorOf = (req) => String(req.adminUser?._id || 'admin');

/* ───────────── fraud review queue ───────────── */
export const listFlags = h(async (req, res) => {
  const status = ['open', 'cleared', 'confirmed'].includes(req.query.status) ? req.query.status : 'open';
  const rows = await ReferralFraudFlag.find({ status }).sort({ createdAt: -1 }).limit(200).lean();
  const names = new Map((await Promoter.find({ _id: { $in: rows.map((r) => r.promoterId) } }).select('name').lean()).map((p) => [String(p._id), p.name]));
  res.json({ success: true, data: rows.map((r) => ({ ...r, promoterName: names.get(String(r.promoterId)) })) });
});

const resolveNote = (req) => {
  const note = String(req.body?.note || '').trim();
  if (note.length < 5) throw bad('A note of at least 5 characters is required');
  return note.slice(0, 400);
};

// Clear: false alarm. Releases the hold if this was the last open flag on the order.
export const clearFlag = h(async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, 'Not found');
  const note = resolveNote(req);
  const f = await ReferralFraudFlag.findOneAndUpdate({ _id: req.params.id, status: 'open' }, { $set: { status: 'cleared', resolvedBy: actorOf(req), resolvedAt: new Date(), resolutionNote: note } }, { new: true });
  if (!f) throw bad('Only an open flag can be cleared');
  if (f.orderReferralId) {
    const stillOpen = await ReferralFraudFlag.countDocuments({ orderReferralId: f.orderReferralId, status: 'open' });
    if (!stillOpen) await OrderReferral.updateOne({ _id: f.orderReferralId }, { $unset: { 'flags.fraudHold': 1 } });
  }
  await audit(req, { action: 'fraud.clear', entity: 'FraudFlag', entityId: f._id, reason: note });
  res.json({ success: true, data: f });
});

// Confirm: real fraud. Claws back the order's commission (ledger reversal_fraud) and voids the referral.
export const confirmFlag = h(async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, 'Not found');
  const note = resolveNote(req);
  const f = await ReferralFraudFlag.findOneAndUpdate({ _id: req.params.id, status: 'open' }, { $set: { status: 'confirmed', resolvedBy: actorOf(req), resolvedAt: new Date(), resolutionNote: note } }, { new: true });
  if (!f) throw bad('Only an open flag can be confirmed');
  let reversed = 0;
  if (f.orderReferralId) {
    const lines = await OrderReferralLine.find({ orderReferralId: f.orderReferralId }).lean();
    const existing = await CommissionLedger.find({ orderReferralLineId: { $in: lines.map((l) => l._id) } }).lean();
    const entries = fraudReversalEntries({ lines, existing, actor: actorOf(req) });
    if (entries.length) {
      try { await CommissionLedger.create(entries, { ordered: true }); } catch (e) { if (e?.code !== 11000) throw e; }
      reversed = -entries.reduce((s, e) => s + e.amountPaise, 0);
    }
    await OrderReferral.updateOne({ _id: f.orderReferralId }, { $set: { status: 'void', voidedAt: new Date(), 'flags.fraudConfirmed': true } });
    await ReferralFraudFlag.updateMany({ orderReferralId: f.orderReferralId, status: 'open' }, { $set: { status: 'confirmed', resolvedBy: actorOf(req), resolvedAt: new Date(), resolutionNote: `Order confirmed as fraud via another flag: ${note}`.slice(0, 400) } });
  }
  await audit(req, { action: 'fraud.confirm', entity: 'FraudFlag', entityId: f._id, after: { reversedPaise: reversed }, reason: note });
  res.json({ success: true, data: { flag: f, reversedPaise: reversed } });
});

/* ───────────── reports ───────────── */
const range = (q) => {
  const from = q.from ? new Date(q.from) : undefined;
  const to = q.to ? new Date(q.to) : undefined;
  if ((from && isNaN(from)) || (to && isNaN(to))) throw bad('Invalid date');
  return { from, to };
};

async function load({ withOrders = true } = {}) {
  const [refs, lines] = await Promise.all([OrderReferral.find().lean(), OrderReferralLine.find().lean()]);
  const orders = new Map();
  if (withOrders && refs.length) {
    for (const o of await Order.find({ _id: { $in: refs.map((r) => r.orderId) } }).select('status billing.referralDiscount').lean()) orders.set(String(o._id), o);
  }
  const names = new Map((await Promoter.find().select('name').lean()).map((p) => [String(p._id), p.name]));
  return { refs, lines, orders, names };
}

const flat = (rows) => { const keys = rows.length ? Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object') : []; return { keys, rows: rows.map((r) => keys.map((k) => (k.endsWith('Paise') ? rupees(r[k]) : r[k]))) }; };
const respond = (req, res, name, data, tableRows) => {
  if (req.query.format === 'csv') {
    const { keys, rows } = flat(tableRows ?? []);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    return res.send(toCsv(keys, rows));
  }
  res.json({ success: true, data });
};

export const reportLiability = h(async (req, res) => {
  const [ledger, items, names] = await Promise.all([
    CommissionLedger.find().select('promoterId bucket amountPaise').lean(), PayoutItem.find({ status: { $in: ['approved', 'paid'] } }).select('promoterId status grossPaise').lean(),
    Promoter.find().select('name').lean().then((ps) => new Map(ps.map((p) => [String(p._id), p.name])))
  ]);
  const r = liabilityReport({ ledger, items, names });
  respond(req, res, 'liability', r, r.rows);
});

export const reportSummary = h(async (req, res) => {
  const { from, to } = range(req.query); const d = await load();
  const s = programmeSummary({ ...d, from, to }); const g = gstImpact({ ...d, from, to });
  respond(req, res, 'programme-summary', { summary: s, gst: g }, g.rows);
});

export const reportPromoters = h(async (req, res) => {
  const { from, to } = range(req.query); const d = await load();
  const rows = promoterPerformance({ ...d, from, to });
  respond(req, res, 'promoter-performance', rows, rows);
});

// Margin uses buying cost, which is super_admin-only data: this route is super_admin only.
export const reportProfit = h(async (req, res) => {
  const { from, to } = range(req.query); const d = await load();
  const pids = [...new Set(d.lines.map((l) => String(l.productId)).filter(Boolean))];
  const prods = await Product.find({ _id: { $in: pids } }).select('+costPrice').lean();
  const costByProduct = new Map(prods.filter((p) => p.costPrice != null).map((p) => [String(p._id), Math.round(p.costPrice * 100)]));
  await audit(req, { action: 'report.profit', entity: 'Report', after: { from, to } });
  const r = profitReport({ ...d, costByProduct, from, to });
  respond(req, res, 'profit', r, [r]);
});

export const reportReconciliation = h(async (req, res) => {
  const d = await load();
  const [ledger, payoutItems, codes, useAgg] = await Promise.all([
    CommissionLedger.find().select('promoterId orderReferralLineId entryType bucket amountPaise').lean(),
    PayoutItem.find().select('status grossPaise').lean(), ReferralCode.find().select('code timesUsed').lean(),
    OrderReferral.aggregate([{ $group: { _id: '$referralCodeId', n: { $sum: 1 } } }])
  ]);
  const checks = reconcile({ refs: d.refs, lines: d.lines, ledger, orders: d.orders, payoutItems, codes, codeUseCounts: new Map(useAgg.map((u) => [String(u._id), u.n])) });
  res.json({ success: true, data: { ranAt: new Date(), allOk: checks.every((c) => c.ok), checks } });
});

export const reportLinks = h(async (req, res) => {
  const { from, to } = range(req.query); const d = await load();
  const [clickRows, codes] = await Promise.all([ReferralClickDay.find().select('codeId day clicks').lean(), ReferralCode.find().select('code promoterId').lean()]);
  const rows = linkPerformance({ clickRows, refs: d.refs, orders: d.orders, codes, names: d.names, from, to });
  respond(req, res, 'link-performance', rows, rows);
});
