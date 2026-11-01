// Phase 3: payout maths (pure) + batch lifecycle against an in-memory fake of the models.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'j'.repeat(40);
process.env.REFERRAL_ENC_KEY = Buffer.alloc(32, 7).toString('base64');

const P = await import('../../services/referral/payout.js');
const { defaultSettings } = await import('../../services/referral/settings.js');

const S = (o = {}) => ({ ...defaultSettings(), min_payout_paise: 50000, ...o });
const PROM = (o = {}) => ({ _id: 'p1', name: 'Asha', status: 'active', kycStatus: 'verified', agreementStatus: 'signed', bankLast4: '1234', bankIfsc: 'SBIN0001234', bankHolderName: 'Asha', panLast4: '234F', stateCode: '05', ...o });

/* ───── pure maths ───── */
test('financialYear: Apr-Mar in IST, boundary at midnight IST', () => {
  assert.equal(P.financialYear(new Date('2026-11-01T00:00:00Z')).label, '2026-27');
  assert.equal(P.financialYear(new Date('2027-03-31T18:00:00Z')).label, '2026-27');    // 31 Mar 23:30 IST
  assert.equal(P.financialYear(new Date('2027-03-31T18:30:00Z')).label, '2027-28');    // 1 Apr 00:00 IST
  assert.equal(P.financialYear(new Date('2027-01-15T00:00:00Z')).label, '2026-27');
});

test('plain payout: no GST, no TDS by default (settings ship off)', () => {
  const r = P.planPayout({ promoter: PROM(), settings: S(), payablePaise: 100000 });
  assert.equal(r.eligible, true);
  assert.deepEqual([r.grossPaise, r.gstPaise, r.tdsPaise, r.netPaise], [100000, 0, 0, 100000]);
});

test('every eligibility blocker is reported', () => {
  const cases = [
    [{ status: 'suspended' }, 'not active'], [{ kycStatus: 'pending' }, 'KYC'], [{ agreementStatus: 'sent' }, 'Agreement'],
    [{ bankLast4: undefined }, 'Bank']
  ];
  for (const [o, word] of cases) {
    const r = P.planPayout({ promoter: PROM(o), settings: S(), payablePaise: 100000 });
    assert.equal(r.eligible, false); assert.ok(r.blockers.some((b) => b.includes(word)), word);
  }
  assert.ok(P.planPayout({ promoter: PROM(), settings: S(), payablePaise: 49999 }).blockers.includes('Below minimum payout'));
  assert.ok(P.planPayout({ promoter: PROM(), settings: S(), payablePaise: 0 }).blockers.includes('Nothing payable'));
  assert.ok(P.planPayout({ promoter: PROM(), settings: S(), payablePaise: -500 }).blockers.includes('Nothing payable'));
});

test('GST on commission: intra-state splits CGST/SGST, inter-state is IGST, net = commission + GST', () => {
  const s = S();
  const intra = P.planPayout({ promoter: PROM({ gstOnCommissionApplicable: true, gstRegistered: true }), settings: s, payablePaise: 100001 });
  assert.equal(intra.gstPaise, 18000);                                     // 1000.01 * 18% = 180.00 (rounded)
  assert.equal(intra.cgstPaise + intra.sgstPaise, intra.gstPaise); assert.equal(intra.igstPaise, 0);
  assert.equal(intra.netPaise, 100001 + 18000);
  const inter = P.planPayout({ promoter: PROM({ gstOnCommissionApplicable: true, gstRegistered: true, stateCode: '07' }), settings: s, payablePaise: 100000 });
  assert.deepEqual([inter.igstPaise, inter.cgstPaise, inter.sgstPaise], [18000, 0, 0]);
  const odd = P.planPayout({ promoter: PROM({ gstOnCommissionApplicable: true, gstRegistered: true }), settings: S({ gst_on_commission_bps: 500 }), payablePaise: 100100 });
  assert.equal(odd.gstPaise, 5005); assert.equal(odd.cgstPaise + odd.sgstPaise, 5005);   // odd paisa never lost
});

test('GST applies but promoter has no GSTIN / state: blocked, not guessed', () => {
  const a = P.planPayout({ promoter: PROM({ gstOnCommissionApplicable: true, gstRegistered: false }), settings: S(), payablePaise: 100000 });
  assert.equal(a.eligible, false); assert.ok(a.blockers.some((b) => b.includes('GSTIN')));
  const b = P.planPayout({ promoter: PROM({ gstOnCommissionApplicable: true, gstRegistered: true, stateCode: '' }), settings: S(), payablePaise: 100000 });
  assert.ok(b.blockers.some((x) => x.includes('state')));
});

test('GST flag on promoter but rate 0 in settings: nothing charged', () => {
  const r = P.planPayout({ promoter: PROM({ gstOnCommissionApplicable: true, gstRegistered: true }), settings: S({ gst_on_commission_bps: 0 }), payablePaise: 100000 });
  assert.equal(r.gstPaise, 0);
});

test('TDS: needs setting ON + promoter flag + rate; deducted on commission excluding GST', () => {
  const s = S({ tds_enabled: true, tds_rate_bps: 1000, tds_section: '194H' });
  const off = P.planPayout({ promoter: PROM({ tdsApplicable: false }), settings: s, payablePaise: 100000 });
  assert.equal(off.tdsPaise, 0);
  const on = P.planPayout({ promoter: PROM({ tdsApplicable: true, gstOnCommissionApplicable: true, gstRegistered: true }), settings: s, payablePaise: 100000 });
  assert.equal(on.tdsPaise, 10000);                                        // 10% of 1000.00, GST excluded from base
  assert.equal(on.netPaise, 100000 + 18000 - 10000); assert.equal(on.tdsSection, '194H');
  const settingOff = P.planPayout({ promoter: PROM({ tdsApplicable: true }), settings: S({ tds_enabled: false, tds_rate_bps: 1000 }), payablePaise: 100000 });
  assert.equal(settingOff.tdsPaise, 0);
});

test('TDS annual threshold: only the part above the threshold is taxed', () => {
  const s = S({ tds_enabled: true, tds_rate_bps: 1000, tds_annual_threshold_paise: 1500000 });   // 15,000
  const p = PROM({ tdsApplicable: true });
  assert.equal(P.planPayout({ promoter: p, settings: s, payablePaise: 1000000, ytdGrossPaise: 0 }).tdsPaise, 0);            // 10k, under
  const cross = P.planPayout({ promoter: p, settings: s, payablePaise: 1000000, ytdGrossPaise: 1000000 });                  // 10k + 10k = 20k, 5k over
  assert.equal(cross.tdsBasePaise, 500000); assert.equal(cross.tdsPaise, 50000);
  const over = P.planPayout({ promoter: p, settings: s, payablePaise: 1000000, ytdGrossPaise: 2000000 });                  // already over: all taxed
  assert.equal(over.tdsBasePaise, 1000000);
});

test('TDS applies but PAN missing: blocked', () => {
  const r = P.planPayout({ promoter: PROM({ tdsApplicable: true, panLast4: undefined }), settings: S({ tds_enabled: true, tds_rate_bps: 1000 }), payablePaise: 100000 });
  assert.equal(r.eligible, false); assert.ok(r.blockers.some((b) => b.includes('PAN')));
});

test('statement: opening + movements = closing; bucket moves net to zero', () => {
  const d = (s) => new Date(s);
  const rows = [
    { eventAt: d('2026-09-20'), entryType: 'accrual_pending', bucket: 'pending', amountPaise: 5000 },
    { eventAt: d('2026-10-05'), entryType: 'accrual_pending', bucket: 'pending', amountPaise: 3000 },
    { eventAt: d('2026-10-10'), entryType: 'release_pending', bucket: 'pending', amountPaise: -5000 },
    { eventAt: d('2026-10-10'), entryType: 'accrual_eligible', bucket: 'payable', amountPaise: 5000 },
    { eventAt: d('2026-10-12'), entryType: 'reversal_cancel', bucket: 'pending', amountPaise: -3000 },
    { eventAt: d('2026-10-15'), entryType: 'adjustment', bucket: 'payable', amountPaise: 700 },
    { eventAt: d('2026-10-20'), entryType: 'payout', bucket: 'payable', amountPaise: -5700 },
    { eventAt: d('2026-11-05'), entryType: 'accrual_pending', bucket: 'pending', amountPaise: 999 }     // after range: ignored
  ];
  const s = P.buildStatement(rows, d('2026-10-01'), d('2026-11-01'));
  assert.equal(s.openingPaise, 5000); assert.equal(s.accruedPaise, 3000); assert.equal(s.reversedPaise, -3000);
  assert.equal(s.adjustedPaise, 700); assert.equal(s.paidOutPaise, -5700);
  assert.equal(s.closingPaise, s.openingPaise + s.accruedPaise + s.reversedPaise + s.adjustedPaise + s.paidOutPaise);
  assert.equal(s.closingPaise, 0); assert.equal(s.payableClosingPaise, 0); assert.equal(s.pendingClosingPaise, 0);
});

test('CSV: quoting and formula-injection protection', () => {
  const csv = P.toCsv(['a', 'b'], [['=HYPERLINK("x")', 'plain, with comma'], ['+1', 'say "hi"'], ['@x', 'ok']]);
  assert.match(csv, /'=HYPERLINK/); assert.match(csv, /"plain, with comma"/); assert.match(csv, /'\+1/); assert.match(csv, /"say ""hi"""/); assert.match(csv, /'@x/);
});

/* ───── batch lifecycle on an in-memory fake DB ───── */
const mongoose = (await import('mongoose')).default;
const M = {
  Promoter: (await import('../../models/referral/Promoter.js')).default,
  Ledger: (await import('../../models/referral/CommissionLedger.js')).default,
  Batch: (await import('../../models/referral/PayoutBatch.js')).default,
  Item: (await import('../../models/referral/PayoutItem.js')).default,
  Counter: (await import('../../models/referral/ReferralCounter.js')).default,
  Audit: (await import('../../models/referral/ReferralAuditLog.js')).default,
  Setting: (await import('../../models/referral/ReferralSetting.js')).default
};
const { clearSettingsCache } = await import('../../services/referral/settings.js');
const C = await import('../../controllers/referralPayoutController.js');
const { encryptString } = await import('../../utils/referralCrypto.js');

const oid = () => new mongoose.Types.ObjectId();
const saved = [];
const stub = (o, n, f) => { saved.push([o, n, o[n]]); o[n] = f; };
const mkRes = () => { const r = { code: 200, body: undefined, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.send = (b) => { r.body = b; return r; }; return r; };
const REQ = (o = {}) => ({ body: {}, query: {}, params: {}, headers: {}, ip: '1.1.1.1', adminUser: { _id: 'adm1', name: 'Boss', role: 'super_admin' }, ...o });

let db, settingsRows;
const match = (doc, q) => Object.entries(q).every(([k, v]) => {
  if (v && typeof v === 'object' && '$in' in v) return v.$in.map(String).includes(String(doc[k]));
  if (v && typeof v === 'object' && '$gt' in v) return doc[k] > v.$gt;
  return String(doc[k]) === String(v);
});
const chain = (arr) => ({ sort: () => chain(arr), limit: () => chain(arr), select: () => chain(arr), lean: async () => arr.map((x) => ({ ...x })), then: (r) => r(arr.map((x) => ({ ...x }))) });

const arrange = () => {
  while (saved.length) { const [o, n, f] = saved.pop(); o[n] = f; }
  clearSettingsCache();
  process.env.REFERRAL_ENABLED = 'true';
  settingsRows = [];
  db = { ledger: [], items: [], batches: [], promoters: [], audit: [], counters: {} };
  stub(M.Setting, 'aggregate', async () => settingsRows);
  stub(M.Audit, 'create', async (e) => { db.audit.push(e); return e; });
  stub(M.Counter, 'findOneAndUpdate', async ({ _id }, { $inc }) => { db.counters[_id] = (db.counters[_id] || 0) + $inc.seq; return { seq: db.counters[_id] }; });
  stub(M.Promoter, 'find', (q) => {
    const arr = db.promoters.filter((p) => match(p, q));
    return { select: () => chain(arr), lean: async () => arr.map((x) => ({ ...x })) };
  });
  stub(M.Ledger, 'aggregate', async (pipe) => {
    const m = {}; db.ledger.filter((r) => r.bucket === 'payable').forEach((r) => { m[String(r.promoterId)] = (m[String(r.promoterId)] || 0) + r.amountPaise; });
    return Object.entries(m).map(([k, v]) => ({ _id: k, amountPaise: v }));
  });
  stub(M.Ledger, 'create', async (e) => {
    if (db.ledger.some((r) => r.idempotencyKey === e.idempotencyKey)) { const err = new Error('dup'); err.code = 11000; throw err; }
    db.ledger.push({ ...e }); return e;
  });
  stub(M.Batch, 'create', async (d) => { const b = { _id: oid(), ...d }; db.batches.push(b); return b; });
  stub(M.Batch, 'findById', (id) => { const b = db.batches.find((x) => String(x._id) === String(id)) || null; return { lean: async () => (b ? { ...b } : null), then: (r, j) => Promise.resolve(b).then(r, j) }; });
  stub(M.Batch, 'updateOne', async (q, { $set }) => { const b = db.batches.find((x) => match(x, q)); if (!b) return { modifiedCount: 0 }; Object.assign(b, $set); return { modifiedCount: 1 }; });
  stub(M.Item, 'create', async (docs) => { docs.forEach((d) => db.items.push({ _id: oid(), ...d })); return docs; });
  stub(M.Item, 'find', (q) => chain(db.items.filter((i) => match(i, q))));
  stub(M.Item, 'aggregate', async () => []);
  stub(M.Item, 'countDocuments', async (q) => db.items.filter((i) => match(i, q)).length);
  stub(M.Item, 'updateOne', async (q, { $set }) => { const i = db.items.find((x) => match(x, q)); if (!i) return { modifiedCount: 0 }; Object.assign(i, $set); return { modifiedCount: 1 }; });
  stub(M.Item, 'findOneAndUpdate', async (q, { $set }) => { const i = db.items.find((x) => match(x, q)); if (!i) return null; Object.assign(i, $set); return i; });
};
const addPromoter = (o = {}) => { const p = { _id: oid(), name: 'Asha', mobile: '9000000001', status: 'active', kycStatus: 'verified', agreementStatus: 'signed', bankLast4: '1234', bankIfsc: 'SBIN0001234', bankHolderName: 'Asha Verma', panLast4: '234F', stateCode: '05', bankAccountEnc: encryptString('123456781234'), ...o }; db.promoters.push(p); return p; };
const addPayable = (p, amt, key = String(Math.random())) => db.ledger.push({ promoterId: p._id, entryType: 'accrual_eligible', bucket: 'payable', amountPaise: amt, idempotencyKey: key, eventAt: new Date() });
const bal = (p) => db.ledger.filter((r) => String(r.promoterId) === String(p._id) && r.bucket === 'payable').reduce((s, r) => s + r.amountPaise, 0);

beforeEach(arrange);

test('create -> approve -> pay: ledger reserved on approve, balance zero, vouchers numbered', async () => {
  const a = addPromoter(); addPayable(a, 120000);
  const b = addPromoter({ mobile: '9000000002', name: 'Bela' }); addPayable(b, 80000);
  let res = mkRes(); await C.createBatch(REQ(), res);
  assert.equal(res.code, 201); assert.match(res.body.data.batchNo, /^PB\/\d{4}-\d{2}\/0001$/);
  assert.equal(db.items.length, 2); assert.equal(db.ledger.filter((r) => r.entryType === 'payout').length, 0, 'draft reserves nothing');
  assert.deepEqual(db.items.map((i) => i.voucherNo.slice(-4)).sort(), ['0001', '0002']);
  const id = String(db.batches[0]._id);
  res = mkRes(); await C.approveBatch(REQ({ params: { id } }), res);
  assert.equal(res.body.data.approved, 2); assert.equal(bal(a), 0); assert.equal(bal(b), 0);
  res = mkRes(); await C.markPaid(REQ({ params: { id }, body: { payments: db.items.map((i) => ({ itemId: String(i._id), utr: 'UTR123456' })) } }), res);
  assert.equal(res.body.data.paid, 2); assert.equal(db.batches[0].status, 'paid'); assert.ok(db.items.every((i) => i.status === 'paid' && i.utr));
});

test('approve twice does not double-reserve (idempotent) and a non-draft batch is refused', async () => {
  const a = addPromoter(); addPayable(a, 120000);
  await C.createBatch(REQ(), mkRes());
  const id = String(db.batches[0]._id);
  await C.approveBatch(REQ({ params: { id } }), mkRes());
  const res = mkRes(); await C.approveBatch(REQ({ params: { id } }), res);
  assert.equal(res.code, 422); assert.equal(db.ledger.filter((r) => r.entryType === 'payout').length, 1);
  assert.equal(bal(a), 0);
});

test('balance reduced after drafting (e.g. reversal): item dropped at approval, never overpaid', async () => {
  const a = addPromoter(); addPayable(a, 120000);
  await C.createBatch(REQ(), mkRes());
  db.ledger.push({ promoterId: a._id, entryType: 'reversal_return', bucket: 'payable', amountPaise: -90000, idempotencyKey: 'rev1', eventAt: new Date() });
  const res = mkRes(); await C.approveBatch(REQ({ params: { id: String(db.batches[0]._id) } }), res);
  assert.equal(res.body.data.dropped, 1); assert.equal(res.body.data.approved, 0);
  assert.equal(db.items[0].status, 'cancelled'); assert.equal(bal(a), 30000); assert.equal(db.batches[0].status, 'cancelled');
});

test('promoter already in an open batch is not drafted again', async () => {
  const a = addPromoter(); addPayable(a, 120000);
  await C.createBatch(REQ(), mkRes());
  const res = mkRes(); await C.createBatch(REQ(), res);
  assert.equal(res.code, 422); assert.equal(db.batches.length, 1);
});

test('failing an approved item returns the money; paying a failed item is impossible', async () => {
  const a = addPromoter(); addPayable(a, 120000);
  await C.createBatch(REQ(), mkRes());
  const id = String(db.batches[0]._id);
  await C.approveBatch(REQ({ params: { id } }), mkRes());
  const itemId = String(db.items[0]._id);
  let res = mkRes(); await C.failItem(REQ({ params: { itemId }, body: { reason: 'Bank rejected: wrong IFSC' } }), res);
  assert.equal(res.code, 200); assert.equal(bal(a), 120000);
  res = mkRes(); await C.failItem(REQ({ params: { itemId }, body: { reason: 'again again' } }), res);
  assert.equal(res.code, 422); assert.equal(bal(a), 120000, 'no double refund');
  res = mkRes(); await C.markPaid(REQ({ params: { id }, body: { payments: [{ itemId, utr: 'UTR999999' }] } }), res);
  assert.equal(res.body.data.paid, 0);
});

test('cancel approved batch voids reserved money; cancelling a paid batch is refused', async () => {
  const a = addPromoter(); addPayable(a, 120000);
  await C.createBatch(REQ(), mkRes());
  const id = String(db.batches[0]._id);
  await C.approveBatch(REQ({ params: { id } }), mkRes());
  assert.equal(bal(a), 0);
  await C.cancelBatch(REQ({ params: { id } }), mkRes());
  assert.equal(bal(a), 120000); assert.equal(db.batches[0].status, 'cancelled');
  const res = mkRes(); await C.cancelBatch(REQ({ params: { id } }), res);
  assert.equal(res.code, 422); assert.equal(bal(a), 120000);
});

test('ineligible promoters (KYC pending, below minimum) are previewed with reasons and never drafted', async () => {
  const a = addPromoter({ kycStatus: 'pending' }); addPayable(a, 120000);
  const b = addPromoter({ mobile: '9000000003', name: 'Cee' }); addPayable(b, 1000);
  const pv = mkRes(); await C.previewPayouts(REQ(), pv);
  assert.equal(pv.body.data.length, 2); assert.ok(pv.body.data.every((x) => !x.eligible && x.blockers.length));
  const res = mkRes(); await C.createBatch(REQ(), res);
  assert.equal(res.code, 422); assert.equal(db.items.length, 0);
});

test('TDS and GST are snapshotted onto the item and the ledger is debited by the commission only', async () => {
  settingsRows = [{ _id: 'tds_enabled', value: true }, { _id: 'tds_rate_bps', value: 1000 }, { _id: 'tds_section', value: '194H' }];
  const a = addPromoter({ tdsApplicable: true, gstOnCommissionApplicable: true, gstRegistered: true }); addPayable(a, 100000);
  await C.createBatch(REQ(), mkRes());
  const it = db.items[0];
  assert.deepEqual([it.grossPaise, it.gstPaise, it.tdsPaise, it.netPaise], [100000, 18000, 10000, 108000]);
  await C.approveBatch(REQ({ params: { id: String(db.batches[0]._id) } }), mkRes());
  assert.equal(db.ledger.find((r) => r.entryType === 'payout').amountPaise, -100000);
});

test('validation: UTR required, reason required', async () => {
  const a = addPromoter(); addPayable(a, 120000);
  await C.createBatch(REQ(), mkRes());
  const id = String(db.batches[0]._id);
  await C.approveBatch(REQ({ params: { id } }), mkRes());
  let res = mkRes(); await C.markPaid(REQ({ params: { id }, body: { payments: [{ itemId: String(db.items[0]._id), utr: 'x' }] } }), res);
  assert.equal(res.code, 422);
  res = mkRes(); await C.failItem(REQ({ params: { itemId: String(db.items[0]._id) }, body: { reason: 'no' } }), res);
  assert.equal(res.code, 422);
});

test('bank file: only for an approved batch, decrypts account, audited; cells are CSV-safe', async () => {
  const a = addPromoter({ bankHolderName: '=cmd|x' }); addPayable(a, 120000);
  await C.createBatch(REQ(), mkRes());
  const id = String(db.batches[0]._id);
  let res = mkRes(); await C.bankFile(REQ({ params: { id } }), res);
  assert.equal(res.code, 422, 'draft batch has no bank file');
  await C.approveBatch(REQ({ params: { id } }), mkRes());
  stub(M.Promoter, 'find', () => ({ select: () => ({ lean: async () => db.promoters.map((p) => ({ ...p })) }) }));
  res = mkRes(); await C.bankFile(REQ({ params: { id } }), res);
  assert.match(String(res.body), /123456781234/); assert.match(String(res.body), /'=cmd/);
  assert.ok(db.audit.some((e) => e.action === 'payout.bankfile.export'));
});

test('routes: payouts writes and bank file are super_admin only; reads allow finance_manager', async () => {
  const { default: router } = await import('../../routes/referralAdminRoutes.js');
  const found = {};
  for (const l of router.stack) {
    if (!l.route) continue;
    const g = l.route.stack.map((s) => s.handle).filter((f) => f.allowedRoles);
    if (g.length) found[`${Object.keys(l.route.methods)[0]} ${l.route.path}`] = g[0].allowedRoles;
  }
  for (const k of ['post /payouts', 'post /payouts/:id/approve', 'post /payouts/:id/paid', 'post /payouts/:id/cancel', 'get /payouts/:id/bank-file', 'post /payout-items/:itemId/fail']) {
    assert.deepEqual(found[k], ['super_admin'], k);
  }
  for (const k of ['get /payouts', 'get /payouts/preview', 'get /statements/:promoterId', 'get /exports/payouts', 'get /exports/tds']) {
    assert.deepEqual(found[k], ['super_admin', 'finance_manager'], k);
  }
});
