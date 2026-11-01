import mongoose from 'mongoose';
import Promoter from '../models/referral/Promoter.js';
import CommissionLedger from '../models/referral/CommissionLedger.js';
import PayoutBatch from '../models/referral/PayoutBatch.js';
import PayoutItem from '../models/referral/PayoutItem.js';
import { nextSeq } from '../models/referral/ReferralCounter.js';
import { audit } from '../services/referral/audit.js';
import { getSettings } from '../services/referral/settings.js';
import { planPayout, financialYear, buildStatement, toCsv, rupees } from '../services/referral/payout.js';
import { decryptString, CryptoConfigError } from '../utils/referralCrypto.js';

const isId = (v) => mongoose.isValidObjectId(v);
class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }
const bad = (m) => new HttpError(422, m);
const h = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ success: false, message: err.message, ...(err.extra || {}) });
    if (err instanceof CryptoConfigError) return res.status(503).json({ success: false, message: err.message });
    if (err?.code === 11000) return res.status(409).json({ success: false, message: 'Already exists' });
    console.error('[referral payout]', err);
    res.status(500).json({ success: false, message: 'Request failed' });
  }
};
const actorOf = (req) => String(req.adminUser?._id || 'admin');
const pad = (n) => String(n).padStart(4, '0');
const OPEN = ['draft', 'approved'];

async function payableByPromoter() {
  const rows = await CommissionLedger.aggregate([
    { $match: { bucket: 'payable' } },
    { $group: { _id: '$promoterId', amountPaise: { $sum: '$amountPaise' } } }
  ]);
  return new Map(rows.map((r) => [String(r._id), r.amountPaise]));
}
async function ytdByPromoter(fy) {
  const rows = await PayoutItem.aggregate([
    { $match: { fy, status: { $in: ['approved', 'paid'] } } },
    { $group: { _id: '$promoterId', grossPaise: { $sum: '$grossPaise' } } }
  ]);
  return new Map(rows.map((r) => [String(r._id), r.grossPaise]));
}
async function planAll(now = new Date()) {
  const settings = await getSettings({ fresh: true });
  const fy = financialYear(now);
  const [pay, ytd, openItems] = await Promise.all([
    payableByPromoter(), ytdByPromoter(fy.label), PayoutItem.find({ status: { $in: OPEN } }).select('promoterId').lean()
  ]);
  const inOpen = new Set(openItems.map((i) => String(i.promoterId)));
  const ids = [...pay.entries()].filter(([, v]) => v > 0).map(([k]) => k);
  const promoters = await Promoter.find({ _id: { $in: ids } }).lean();
  const plans = promoters.map((p) => {
    const plan = planPayout({ promoter: p, settings, payablePaise: pay.get(String(p._id)) || 0, ytdGrossPaise: ytd.get(String(p._id)) || 0 });
    if (inOpen.has(String(p._id))) { plan.eligible = false; plan.blockers.push('Already in an open payout batch'); }
    return { promoter: p, plan };
  });
  return { plans, fy, settings };
}
const planView = ({ promoter: p, plan }) => ({
  promoterId: String(p._id), name: p.name, panLast4: p.panLast4, ...plan
});

// Preview: nothing is written.
export const previewPayouts = h(async (_req, res) => {
  const { plans, fy } = await planAll();
  res.json({ success: true, fy: fy.label, data: plans.map(planView) });
});

// Create a DRAFT batch from the current eligible promoters (optionally a chosen subset).
export const createBatch = h(async (req, res) => {
  const only = Array.isArray(req.body?.promoterIds) ? new Set(req.body.promoterIds.map(String)) : null;
  const { plans, fy } = await planAll();
  const chosen = plans.filter((x) => x.plan.eligible && (!only || only.has(String(x.promoter._id))));
  if (!chosen.length) throw bad('No eligible promoters for a payout right now');

  const batchSeq = await nextSeq(`batch:${fy.label}`);
  const lastVoucher = await nextSeq(`voucher:${fy.label}`, chosen.length);
  const firstVoucher = lastVoucher - chosen.length + 1;
  const batch = await PayoutBatch.create({
    batchNo: `PB/${fy.label}/${pad(batchSeq)}`, fy: fy.label, status: 'draft', itemCount: chosen.length,
    grossPaise: chosen.reduce((s, x) => s + x.plan.grossPaise, 0), gstPaise: chosen.reduce((s, x) => s + x.plan.gstPaise, 0),
    tdsPaise: chosen.reduce((s, x) => s + x.plan.tdsPaise, 0), netPaise: chosen.reduce((s, x) => s + x.plan.netPaise, 0),
    note: String(req.body?.note || '').slice(0, 300), createdBy: actorOf(req)
  });
  await PayoutItem.create(chosen.map(({ promoter: p, plan }, i) => ({
    batchId: batch._id, promoterId: p._id, fy: fy.label, voucherNo: `SAG/PO/${fy.label}/${pad(firstVoucher + i)}`,
    promoterName: p.name, panLast4: p.panLast4, gstinLast4: p.gstinLast4, stateCode: p.stateCode,
    grossPaise: plan.grossPaise, gstPaise: plan.gstPaise, cgstPaise: plan.cgstPaise, sgstPaise: plan.sgstPaise, igstPaise: plan.igstPaise,
    tdsPaise: plan.tdsPaise, tdsBasePaise: plan.tdsBasePaise, tdsRateBps: plan.tdsRateBps, tdsSection: plan.tdsSection, netPaise: plan.netPaise, status: 'draft'
  })), { ordered: true });
  await audit(req, { action: 'payout.batch.create', entity: 'PayoutBatch', entityId: batch._id, after: { batchNo: batch.batchNo, items: chosen.length, netPaise: batch.netPaise } });
  res.status(201).json({ success: true, data: batch });
});

export const listBatches = h(async (_req, res) => {
  const rows = await PayoutBatch.find().sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: rows });
});

export const getBatch = h(async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, 'Not found');
  const batch = await PayoutBatch.findById(req.params.id).lean();
  if (!batch) throw new HttpError(404, 'Not found');
  const items = await PayoutItem.find({ batchId: batch._id }).sort({ voucherNo: 1 }).lean();
  res.json({ success: true, data: { ...batch, items } });
});

// Approve: reserves the money in the ledger (payout entry, -gross from payable) per item.
// Re-checks the live balance, so reversals/adjustments made after drafting can never overpay.
export const approveBatch = h(async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, 'Not found');
  const batch = await PayoutBatch.findById(req.params.id);
  if (!batch) throw new HttpError(404, 'Not found');
  if (batch.status !== 'draft') throw bad(`Batch is ${batch.status}, only a draft can be approved`);
  const now = new Date();
  const items = await PayoutItem.find({ batchId: batch._id, status: 'draft' });
  const pay = await payableByPromoter();
  let approved = 0, dropped = 0;
  for (const it of items) {
    const bal = pay.get(String(it.promoterId)) || 0;
    if (bal < it.grossPaise) {
      await PayoutItem.updateOne({ _id: it._id, status: 'draft' }, { $set: { status: 'cancelled', failureReason: 'Balance changed since the draft; create a new batch' } });
      dropped++; continue;
    }
    try {
      await CommissionLedger.create({
        promoterId: it.promoterId, entryType: 'payout', bucket: 'payable', amountPaise: -it.grossPaise,
        reason: `Payout ${it.voucherNo}`, eventAt: now, actor: actorOf(req), idempotencyKey: `${it._id}:payout`
      });
    } catch (e) { if (e?.code !== 11000) throw e; }              // already reserved by an earlier attempt
    await PayoutItem.updateOne({ _id: it._id, status: 'draft' }, { $set: { status: 'approved' } });
    pay.set(String(it.promoterId), bal - it.grossPaise);
    approved++;
  }
  const upd = await PayoutBatch.updateOne({ _id: batch._id, status: 'draft' }, { $set: { status: approved ? 'approved' : 'cancelled', approvedBy: actorOf(req), approvedAt: now } });
  await audit(req, { action: 'payout.batch.approve', entity: 'PayoutBatch', entityId: batch._id, after: { approved, dropped } });
  res.json({ success: true, data: { approved, dropped, modified: upd.modifiedCount } });
});

// Record that the bank transfer was made. Body: { payments: [{ itemId, utr }] }
export const markPaid = h(async (req, res) => {
  const list = Array.isArray(req.body?.payments) ? req.body.payments : [];
  if (!list.length) throw bad('payments[] with itemId and utr is required');
  const now = new Date();
  let paid = 0;
  for (const p of list) {
    const utr = String(p?.utr || '').trim();
    if (!isId(p?.itemId) || utr.length < 6 || utr.length > 40) throw bad('Each payment needs a valid itemId and a UTR of 6-40 characters');
    const r = await PayoutItem.updateOne({ _id: p.itemId, batchId: req.params.id, status: 'approved' }, { $set: { status: 'paid', utr, paidAt: now } });
    paid += r.modifiedCount;
  }
  const left = await PayoutItem.countDocuments({ batchId: req.params.id, status: 'approved' });
  if (!left && paid) await PayoutBatch.updateOne({ _id: req.params.id, status: 'approved' }, { $set: { status: 'paid', paidAt: now } });
  await audit(req, { action: 'payout.mark_paid', entity: 'PayoutBatch', entityId: req.params.id, after: { paid, left } });
  res.json({ success: true, data: { paid, remaining: left } });
});

// Fail an approved-but-unpaid item: returns the money to the promoter's payable balance.
export const failItem = h(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) throw bad('A reason of at least 5 characters is required');
  if (!isId(req.params.itemId)) throw new HttpError(404, 'Not found');
  const it = await PayoutItem.findOneAndUpdate({ _id: req.params.itemId, status: 'approved' }, { $set: { status: 'failed', failureReason: reason.slice(0, 300) } }, { new: true });
  if (!it) throw bad('Only an approved, unpaid item can be failed');
  try {
    await CommissionLedger.create({
      promoterId: it.promoterId, entryType: 'payout_void', bucket: 'payable', amountPaise: it.grossPaise,
      reason: `Payout ${it.voucherNo} failed: ${reason}`.slice(0, 300), eventAt: new Date(), actor: actorOf(req), idempotencyKey: `${it._id}:void`
    });
  } catch (e) { if (e?.code !== 11000) throw e; }
  await audit(req, { action: 'payout.item.fail', entity: 'PayoutItem', entityId: it._id, reason });
  res.json({ success: true, data: it });
});

// Cancel a whole batch: draft (nothing reserved) or approved (unpaid items are voided back).
export const cancelBatch = h(async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, 'Not found');
  const batch = await PayoutBatch.findById(req.params.id);
  if (!batch) throw new HttpError(404, 'Not found');
  if (!OPEN.includes(batch.status)) throw bad(`Batch is ${batch.status} and cannot be cancelled`);
  const now = new Date();
  for (const it of await PayoutItem.find({ batchId: batch._id, status: { $in: OPEN } })) {
    const was = it.status;
    const r = await PayoutItem.updateOne({ _id: it._id, status: was }, { $set: { status: 'cancelled' } });
    if (was === 'approved' && r.modifiedCount) {
      try {
        await CommissionLedger.create({
          promoterId: it.promoterId, entryType: 'payout_void', bucket: 'payable', amountPaise: it.grossPaise,
          reason: `Payout ${it.voucherNo} cancelled`, eventAt: now, actor: actorOf(req), idempotencyKey: `${it._id}:void`
        });
      } catch (e) { if (e?.code !== 11000) throw e; }
    }
  }
  await PayoutBatch.updateOne({ _id: batch._id }, { $set: { status: 'cancelled', cancelledBy: actorOf(req), cancelledAt: now } });
  await audit(req, { action: 'payout.batch.cancel', entity: 'PayoutBatch', entityId: batch._id });
  res.json({ success: true });
});

// Promoter statement for a date range (no customer data).
export const statement = h(async (req, res) => {
  if (!isId(req.params.promoterId)) throw new HttpError(404, 'Not found');
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 30 * 86400000);
  if (isNaN(from) || isNaN(to) || from >= to) throw bad('Invalid date range');
  const promoter = await Promoter.findById(req.params.promoterId).select('name panLast4 gstinLast4').lean();
  if (!promoter) throw new HttpError(404, 'Not found');
  const rows = await CommissionLedger.find({ promoterId: req.params.promoterId, eventAt: { $lt: to } }).sort({ eventAt: 1 }).lean();
  const items = await PayoutItem.find({ promoterId: req.params.promoterId, createdAt: { $gte: from, $lt: to } }).sort({ createdAt: 1 }).lean();
  res.json({ success: true, data: { promoter, from, to, summary: buildStatement(rows, from, to), payouts: items } });
});

/* ───────────── exports (CSV) ───────────── */
const sendCsv = (res, name, csv) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(csv);
};

// Bank upload sheet: contains full account numbers, so super_admin only and audited strictly.
export const bankFile = h(async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, 'Not found');
  const batch = await PayoutBatch.findById(req.params.id).lean();
  if (!batch) throw new HttpError(404, 'Not found');
  if (batch.status !== 'approved') throw bad('Bank file is available only for an approved batch');
  const items = await PayoutItem.find({ batchId: batch._id, status: 'approved' }).lean();
  const proms = await Promoter.find({ _id: { $in: items.map((i) => i.promoterId) } }).select('+bankAccountEnc bankIfsc bankHolderName').lean();
  const by = new Map(proms.map((p) => [String(p._id), p]));
  await audit(req, { action: 'payout.bankfile.export', entity: 'PayoutBatch', entityId: batch._id, after: { items: items.length } }, { strict: true });
  const rows = items.map((i) => {
    const p = by.get(String(i.promoterId)) || {};
    return [i.voucherNo, p.bankHolderName, p.bankAccountEnc ? decryptString(p.bankAccountEnc) : '', p.bankIfsc, rupees(i.netPaise), `Sagona commission ${i.voucherNo}`];
  });
  sendCsv(res, `bank-${batch.batchNo.replace(/\//g, '-')}.csv`, toCsv(['Ref', 'Beneficiary name', 'Account number', 'IFSC', 'Amount (INR)', 'Narration'], rows));
});

// Accounting export: one row per payout item in a date range.
export const accountingExport = h(async (req, res) => {
  const f = {};
  if (req.query.fy) f.fy = String(req.query.fy);
  if (req.query.status) f.status = String(req.query.status); else f.status = { $in: ['approved', 'paid'] };
  const items = await PayoutItem.find(f).sort({ voucherNo: 1 }).lean();
  await audit(req, { action: 'payout.accounting.export', entity: 'PayoutItem', after: { rows: items.length, fy: req.query.fy } });
  const rows = items.map((i) => [i.voucherNo, i.fy, i.status, i.promoterName, i.panLast4 ? `XXXXXX${i.panLast4}` : '', i.gstinLast4 ? `XXXXXXXXXXX${i.gstinLast4}` : '', i.stateCode,
    rupees(i.grossPaise), rupees(i.cgstPaise), rupees(i.sgstPaise), rupees(i.igstPaise), rupees(i.tdsPaise), i.tdsSection || '', rupees(i.netPaise), i.utr || '', i.paidAt ? new Date(i.paidAt).toISOString().slice(0, 10) : '']);
  sendCsv(res, `payouts-${req.query.fy || 'all'}.csv`, toCsv(['Voucher', 'FY', 'Status', 'Promoter', 'PAN', 'GSTIN', 'State', 'Commission', 'CGST', 'SGST', 'IGST', 'TDS', 'TDS section', 'Net paid', 'UTR', 'Paid on'], rows));
});

// TDS summary by promoter and PAN (for the TDS return working). Full PAN is decrypted: audited strictly.
export const tdsExport = h(async (req, res) => {
  const fy = String(req.query.fy || financialYear().label);
  const items = await PayoutItem.find({ fy, status: 'paid', tdsPaise: { $gt: 0 } }).sort({ paidAt: 1 }).lean();
  const proms = await Promoter.find({ _id: { $in: [...new Set(items.map((i) => String(i.promoterId)))] } }).select('+panEnc').lean();
  const pan = new Map(proms.map((p) => [String(p._id), p.panEnc ? decryptString(p.panEnc) : '']));
  await audit(req, { action: 'payout.tds.export', entity: 'PayoutItem', after: { fy, rows: items.length } }, { strict: true });
  const rows = items.map((i) => [i.voucherNo, i.promoterName, pan.get(String(i.promoterId)), i.tdsSection || '', new Date(i.paidAt).toISOString().slice(0, 10), rupees(i.tdsBasePaise), (i.tdsRateBps / 100).toFixed(2), rupees(i.tdsPaise)]);
  sendCsv(res, `tds-${fy}.csv`, toCsv(['Voucher', 'Promoter', 'PAN', 'Section', 'Paid on', 'Amount subject to TDS', 'Rate %', 'TDS deducted'], rows));
});
