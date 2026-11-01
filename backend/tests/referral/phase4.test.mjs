// Phase 4: fraud rules, fraud scan + hold in the sweeper, confirm/clear, reports, reconciliation.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'j'.repeat(40);
process.env.REFERRAL_ENC_KEY = Buffer.alloc(32, 7).toString('base64');

const F = await import('../../services/referral/fraud.js');
const R = await import('../../services/referral/reports.js');
const L = await import('../../services/referral/ledger.js');
const { scanReferredOrder, scanPromoters } = await import('../../services/referral/fraudScan.js');
const { runReferralSweep } = await import('../../services/referral/jobs.js');
const { customerKeys } = await import('../../services/referral/discount.js');
const { defaultSettings } = await import('../../services/referral/settings.js');
const S = defaultSettings();

/* ───── pure fraud rules ───── */
const PROMO = { mobile: '9000000001', email: 'asha@example.com', address: { line1: '12 Rose Lane', pincode: '249403' } };
test('self-referral: buyer phone/email or delivery phone equals promoter', () => {
  const byEmail = F.evaluateOrderRules({ ref: { customerKeys: customerKeys({ email: 'ASHA@example.com' }) }, promoter: PROMO, order: {}, settings: S });
  assert.ok(byEmail.some((h) => h.rule === 'self_referral' && h.severity === 'high'));
  const byShipPhone = F.evaluateOrderRules({ ref: { customerKeys: [] }, promoter: PROMO, order: { shippingAddress: { phone: '+91 90000 00001' } }, settings: S });
  assert.ok(byShipPhone.some((h) => h.rule === 'self_referral'));
  assert.equal(F.evaluateOrderRules({ ref: { customerKeys: customerKeys({ phone: '9876543210' }) }, promoter: PROMO, order: {}, settings: S }).length, 0);
});
test('address match ignores case and punctuation; different pincode is not a match', () => {
  const o = (line1, pincode) => ({ shippingAddress: { line1, pincode } });
  assert.ok(F.evaluateOrderRules({ ref: {}, promoter: PROMO, order: o('12, ROSE lane', '249403'), settings: S }).some((h) => h.rule === 'address_match'));
  assert.equal(F.evaluateOrderRules({ ref: {}, promoter: PROMO, order: o('12 Rose Lane', '110001'), settings: S }).length, 0);
});
test('velocity triggers only ABOVE the limit; repeat customer at 3', () => {
  const lim = S.fraud_velocity_orders_24h;
  const r = (c) => F.evaluateOrderRules({ ref: {}, promoter: PROMO, order: {}, counts: c, settings: S }).map((h) => h.rule);
  assert.deepEqual(r({ sameCode24h: lim }), []); assert.deepEqual(r({ sameCode24h: lim + 1 }), ['velocity']);
  assert.deepEqual(r({ customerWithPromoter30d: 2 }), []); assert.deepEqual(r({ customerWithPromoter30d: 3 }), ['repeat_customer']);
});
test('promoter return-rate alert needs minimum volume and the threshold', () => {
  const e = (n, b) => F.evaluatePromoterRules({ orders30d: n, badOrders30d: b, settings: S });
  assert.equal(e(4, 4).length, 0, 'too few orders to judge'); assert.equal(e(10, 3).length, 0); assert.equal(e(10, 4).length, 1);
});

/* ───── fraud reversal ledger ───── */
test('fraudReversalEntries: reverses in the right bucket, only once, same key as cancel reversal', () => {
  const line = { _id: 'l1', promoterId: 'p', orderId: 'o', commissionPaise: 1000 };
  const accrual = { orderReferralLineId: 'l1', entryType: 'accrual_pending', amountPaise: 1000 };
  const pend = L.fraudReversalEntries({ lines: [line], existing: [accrual] });
  assert.equal(pend[0].bucket, 'pending'); assert.equal(pend[0].amountPaise, -1000); assert.equal(pend[0].idempotencyKey, 'l1:reversal');
  const pay = L.fraudReversalEntries({ lines: [line], existing: [accrual, { orderReferralLineId: 'l1', entryType: 'accrual_eligible', amountPaise: 1000 }] });
  assert.equal(pay[0].bucket, 'payable');
  assert.equal(L.fraudReversalEntries({ lines: [line], existing: [accrual, { orderReferralLineId: 'l1', entryType: 'reversal_cancel', amountPaise: -1000 }] }).length, 0);
  assert.equal(L.fraudReversalEntries({ lines: [{ ...line, commissionPaise: 0 }], existing: [accrual] }).length, 0);
});

/* ───── scan + sweeper hold (fake models) ───── */
const mkM = (counts = {}) => {
  const flags = [], updates = [];
  return {
    flags, updates,
    m: {
      Promoter: { findById: () => ({ select: () => ({ lean: async () => PROMO }) }) },
      OrderReferral: {
        countDocuments: async (q) => (q.referralCodeId ? counts.sameCode ?? 1 : counts.repeat ?? 1),
        updateOne: async (f, u) => { updates.push([f, u]); return { modifiedCount: 1 }; }
      },
      ReferralFraudFlag: { create: async (d) => { if (flags.some((x) => x.key === d.key)) { const e = new Error('dup'); e.code = 11000; throw e; } flags.push(d); return d; } }
    }
  };
};
const REF = (o = {}) => ({ _id: 'r1', orderId: 'o1', orderNumber: 'SAG-1', promoterId: 'p1', referralCodeId: 'c1', createdAt: new Date('2026-11-01'), customerKeys: customerKeys({ phone: '9876543210' }), flags: {}, ...o });

test('scan: clean order -> no flags, marked scanned, not held', async () => {
  const x = mkM(); const ref = REF();
  assert.equal(await scanReferredOrder({ m: x.m, ref, order: {}, settings: S }), false);
  assert.equal(x.flags.length, 0); assert.equal(ref.flags.fraudScanned, true); assert.equal(ref.flags.fraudHold, undefined);
});
test('scan: suspicious order -> flag created once and order held; second scan is a no-op', async () => {
  const x = mkM({ sameCode: 99 }); const ref = REF();
  assert.equal(await scanReferredOrder({ m: x.m, ref, order: {}, settings: S }), true);
  assert.equal(x.flags.length, 1); assert.equal(x.flags[0].key, 'r1:velocity'); assert.equal(ref.flags.fraudHold, true);
  assert.equal(await scanReferredOrder({ m: x.m, ref, order: {}, settings: S }), true); assert.equal(x.flags.length, 1);
});
test('scan: duplicate-key flag (concurrent run) is tolerated', async () => {
  const x = mkM({ sameCode: 99 }); x.flags.push({ key: 'r1:velocity' });
  assert.equal(await scanReferredOrder({ m: x.m, ref: REF(), order: {}, settings: S }), true);
});
test('scanPromoters: raises one monthly return-rate flag, idempotent', async () => {
  const flags = [];
  const refs = Array.from({ length: 10 }, (_, i) => ({ promoterId: 'p1', orderId: `o${i}` }));
  const m = {
    OrderReferral: { find: () => ({ select: () => ({ lean: async () => refs }) }) },
    Order: { find: () => ({ select: () => ({ lean: async () => refs.map((r, i) => ({ _id: r.orderId, status: i < 5 ? 'returned' : 'delivered' })) }) }) },
    ReferralFraudFlag: { create: async (d) => { if (flags.some((f) => f.key === d.key)) { const e = new Error('d'); e.code = 11000; throw e; } flags.push(d); } }
  };
  assert.equal(await scanPromoters({ m, settings: S, now: new Date('2026-11-15T00:00:00Z') }), 1);
  assert.equal(await scanPromoters({ m, settings: S, now: new Date('2026-11-20T00:00:00Z') }), 0);
  assert.equal(flags[0].key, 'promoter:p1:return_rate:2026-11');
});

test('sweeper: a delivered, past-window order that gets flagged does NOT become payable', async () => {
  const x = mkM({ sameCode: 99 });
  const ledgerRows = [{ orderReferralLineId: 'l1', entryType: 'accrual_pending', amountPaise: 1000 }];
  const created = [];
  const ref = REF({ status: 'applied', createdAt: new Date('2026-09-01') });
  const deps = {
    OrderReferral: { find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [ref] }) }) }), updateOne: x.m.OrderReferral.updateOne, countDocuments: x.m.OrderReferral.countDocuments },
    OrderReferralLine: { find: () => ({ lean: async () => [{ _id: 'l1', promoterId: 'p1', orderId: 'o1', commissionPaise: 1000 }] }) },
    CommissionLedger: { find: () => ({ lean: async () => ledgerRows }), create: async (e) => { created.push(...e); } },
    ReferralJobState: { findOneAndUpdate: async () => ({}), updateOne: async () => ({}) },
    Order: { find: x.m.OrderReferral.find, findById: () => ({ select: () => ({ lean: async () => ({ status: 'delivered', timeline: [{ status: 'delivered', timestamp: new Date('2026-09-05') }] }) }) }) },
    getSettings: async () => S, log: { error() {}, warn() {} },
    fraud: { m: { ...x.m, Order: { find: () => ({ select: () => ({ lean: async () => [] }) }) } } }
  };
  deps.fraud.m.OrderReferral = { ...x.m.OrderReferral, find: () => ({ select: () => ({ lean: async () => [] }) }) };
  await runReferralSweep(deps, new Date('2026-11-01'));
  assert.equal(created.length, 0, 'held: nothing released'); assert.equal(x.flags.length, 1);
  // same order, no fraud => released (control)
  const y = mkM({ sameCode: 1 }); const ref2 = REF({ status: 'applied', createdAt: new Date('2026-09-01') });
  deps.OrderReferral.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [ref2] }) }) });
  deps.fraud.m = { ...y.m, Order: { find: () => ({ select: () => ({ lean: async () => [] }) }) } }; deps.fraud.m.OrderReferral = { ...y.m.OrderReferral, find: () => ({ select: () => ({ lean: async () => [] }) }) };
  await runReferralSweep(deps, new Date('2026-11-01'));
  assert.ok(created.some((e) => e.entryType === 'accrual_eligible'));
});

/* ───── reports ───── */
const orders = new Map([['o1', { status: 'delivered', billing: { referralDiscount: 50 } }], ['o2', { status: 'cancelled', billing: { referralDiscount: 20 } }], ['o3', { status: 'placed', billing: { referralDiscount: 10 } }]]);
const refs = [
  { _id: 'r1', orderId: 'o1', orderNumber: 'A', promoterId: 'p1', createdAt: '2026-11-01', discountTotalPaise: 5000, commissionTotalPaise: 400 },
  { _id: 'r2', orderId: 'o2', orderNumber: 'B', promoterId: 'p1', createdAt: '2026-11-02', discountTotalPaise: 2000, commissionTotalPaise: 100 },
  { _id: 'r3', orderId: 'o3', orderNumber: 'C', promoterId: 'p2', createdAt: '2026-12-02', discountTotalPaise: 1000, commissionTotalPaise: 50 }
];
const line = (rid, oid, o = {}) => ({ _id: `l-${rid}`, orderReferralId: rid, orderId: oid, promoterId: 'p1', productId: 'prod1', qty: 1, category: 'kids', gstRate: 5, lineGrossPaise: 50000, lineDiscountPaise: 5000, lineChargedPaise: 45000, lineTaxablePaise: 42857, lineGstPaise: 2143, commissionPaise: 400, ...o });
const lines = [line('r1', 'o1'), line('r2', 'o2', { lineDiscountPaise: 2000, commissionPaise: 100 }), line('r3', 'o3', { lineDiscountPaise: 1000, commissionPaise: 50 })];
const names = new Map([['p1', 'Asha'], ['p2', 'Bela']]);

test('summary: cancelled orders are not sales; period filter works; cost % uses discount + commission over list', () => {
  const s = R.programmeSummary({ refs, lines, orders, from: '2026-11-01', to: '2026-12-01' });
  assert.equal(s.orders, 1); assert.equal(s.cancelledOrReturned, 1); assert.equal(s.listPaise, 50000); assert.equal(s.discountPaise, 5000); assert.equal(s.commissionPaise, 400);
  assert.equal(s.programmeCostPct, 10.8); assert.equal(s.byCategory.kids.taxablePaise, 42857);
});
test('GST impact: discount splits into taxable reduction + GST reduction that sum to the discount', () => {
  const g = R.gstImpact({ refs, lines, orders, from: '2026-11-01', to: '2026-12-01' });
  assert.equal(g.total.taxableReductionPaise + g.total.gstReductionPaise, g.total.discountPaise);
  assert.equal(g.rows[0].gstRate, 5); assert.equal(g.rows[0].taxableReductionPaise, 4762); assert.equal(g.rows[0].gstReductionPaise, 238);
});
test('promoter performance: return rate and sorted by commission', () => {
  const p = R.promoterPerformance({ refs, lines, orders, names });
  assert.equal(p[0].name, 'Asha'); assert.equal(p[0].orders, 2); assert.equal(p[0].cancelledOrReturned, 1); assert.equal(p[0].returnRatePct, 50);
  assert.equal(p[0].commissionPaise, 400, 'cancelled order commission excluded');
});
test('liability: pending + payable + reserved = owed; paid shown separately', () => {
  const r = R.liabilityReport({
    ledger: [{ promoterId: 'p1', bucket: 'pending', amountPaise: 300 }, { promoterId: 'p1', bucket: 'payable', amountPaise: 700 }],
    items: [{ promoterId: 'p1', status: 'approved', grossPaise: 500 }, { promoterId: 'p1', status: 'paid', grossPaise: 900 }], names });
  assert.deepEqual([r.total.owedPaise, r.total.paidPaise, r.rows[0].name], [1500, 900, 'Asha']);
});
test('profit: uses cost, never guesses missing cost, margin after commission', () => {
  const costs = new Map([['prod1', 20000]]);
  const r = R.profitReport({ refs, lines, orders, costByProduct: costs, from: '2026-11-01', to: '2026-12-01' });
  assert.deepEqual([r.taxablePaise, r.costPaise, r.commissionPaise, r.marginPaise], [42857, 20000, 400, 22457]);
  const none = R.profitReport({ refs, lines, orders, costByProduct: new Map(), from: '2026-11-01', to: '2026-12-01' });
  assert.equal(none.taxablePaise, 0); assert.equal(none.unknownCostPaise, 42857);
});

/* ───── reconciliation ───── */
const goodLedger = [
  { promoterId: 'p1', orderReferralLineId: 'l-r1', entryType: 'accrual_pending', bucket: 'pending', amountPaise: 400 },
  { promoterId: 'p1', orderReferralLineId: 'l-r2', entryType: 'accrual_pending', bucket: 'pending', amountPaise: 100 },
  { promoterId: 'p1', orderReferralLineId: 'l-r2', entryType: 'reversal_cancel', bucket: 'pending', amountPaise: -100 },
  { promoterId: 'p2', orderReferralLineId: 'l-r3', entryType: 'accrual_pending', bucket: 'pending', amountPaise: 50 }
];
const base = () => ({
  refs: refs.map((r) => ({ ...r })), lines: lines.map((l) => ({ ...l })), ledger: goodLedger.map((e) => ({ ...e })), orders,
  payoutItems: [], codes: [{ _id: 'c1', code: 'X', timesUsed: 3 }], codeUseCounts: new Map([['c1', 3]])
});
const failing = (d) => R.reconcile(d).filter((c) => !c.ok).map((c) => c.check);
test('reconcile: consistent data passes every check', () => {
  const d = base();
  d.refs[0].discountTotalPaise = 5000; d.refs[1].discountTotalPaise = 2000; d.refs[2].discountTotalPaise = 1000;
  d.refs.forEach((r, i) => { r.commissionTotalPaise = [400, 100, 50][i]; });
  d.orders = new Map([['o1', { status: 'delivered', billing: { referralDiscount: 50 } }], ['o2', { status: 'cancelled', billing: { referralDiscount: 20 } }], ['o3', { status: 'placed', billing: { referralDiscount: 10 } }]]);
  assert.deepEqual(failing(d), []);
});
test('reconcile: each kind of corruption is detected', () => {
  const mk = () => { const d = base(); d.refs.forEach((r, i) => { r.commissionTotalPaise = [400, 100, 50][i]; }); return d; };
  let d = mk(); d.refs[0].commissionTotalPaise = 999; assert.ok(failing(d).some((c) => /totals equal the sum/.test(c)));
  d = mk(); d.ledger.splice(0, 1); assert.ok(failing(d).some((c) => /matching accrual/.test(c)));
  d = mk(); d.orders = new Map([...orders, ['o1', { status: 'delivered', billing: { referralDiscount: 75 } }]]); assert.ok(failing(d).some((c) => /Discount on the order/.test(c)));
  d = mk(); d.ledger.push({ promoterId: 'p1', orderReferralLineId: 'l-r1', entryType: 'adjustment', bucket: 'payable', amountPaise: -50 }); assert.ok(failing(d).some((c) => /negative/.test(c)));
  d = mk(); d.ledger.push({ promoterId: 'p1', orderReferralLineId: 'l-r1', entryType: 'accrual_eligible', bucket: 'payable', amountPaise: 400 }); assert.ok(failing(d).some((c) => /releases balance/.test(c)));
  d = mk(); d.ledger.push({ promoterId: 'p1', entryType: 'payout', bucket: 'payable', amountPaise: -100 }); assert.ok(failing(d).some((c) => /Payout ledger/.test(c)));
  d = mk(); d.codes[0].timesUsed = 7; assert.ok(failing(d).some((c) => /usage counters/.test(c)));
  d = mk(); d.ledger = d.ledger.filter((e) => e.entryType !== 'reversal_cancel'); assert.ok(failing(d).some((c) => /unreversed/.test(c)));
});

/* ───── controller: confirm / clear with fake models + routes ───── */
const mongoose = (await import('mongoose')).default;
const M = {
  Flag: (await import('../../models/referral/ReferralFraudFlag.js')).default,
  OR: (await import('../../models/referral/OrderReferral.js')).default,
  Line: (await import('../../models/referral/OrderReferralLine.js')).default,
  Ledger: (await import('../../models/referral/CommissionLedger.js')).default,
  Audit: (await import('../../models/referral/ReferralAuditLog.js')).default
};
const C = await import('../../controllers/referralReportController.js');
const saved = []; const stub = (o, n, f) => { saved.push([o, n, o[n]]); o[n] = f; };
const mkRes = () => { const r = { code: 200, body: undefined }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const REQ = (o = {}) => ({ body: {}, query: {}, params: {}, headers: {}, ip: '1', adminUser: { _id: 'adm', name: 'Boss', role: 'super_admin' }, ...o });
let st;
beforeEach(() => {
  while (saved.length) { const [o, n, f] = saved.pop(); o[n] = f; }
  const rid = new mongoose.Types.ObjectId(), lid = new mongoose.Types.ObjectId(), fid = new mongoose.Types.ObjectId(), fid2 = new mongoose.Types.ObjectId();
  st = { rid, lid, fid, fid2, flags: [{ _id: fid, status: 'open', orderReferralId: rid }, { _id: fid2, status: 'open', orderReferralId: rid }], ledger: [{ orderReferralLineId: lid, entryType: 'accrual_pending', bucket: 'pending', amountPaise: 1000 }], created: [], orUpdates: [] };
  stub(M.Audit, 'create', async () => ({}));
  stub(M.Flag, 'findOneAndUpdate', async (q, { $set }) => { const f = st.flags.find((x) => String(x._id) === String(q._id) && x.status === q.status); if (!f) return null; Object.assign(f, $set); return f; });
  stub(M.Flag, 'countDocuments', async () => st.flags.filter((f) => f.status === 'open').length);
  stub(M.Flag, 'updateMany', async (q, { $set }) => { st.flags.filter((f) => f.status === 'open').forEach((f) => Object.assign(f, $set)); return {}; });
  stub(M.OR, 'updateOne', async (f, u) => { st.orUpdates.push(u); return {}; });
  stub(M.Line, 'find', () => ({ lean: async () => [{ _id: st.lid, promoterId: 'p1', orderId: 'o1', commissionPaise: 1000 }] }));
  stub(M.Ledger, 'find', () => ({ lean: async () => st.ledger }));
  stub(M.Ledger, 'create', async (e) => { st.created.push(...e); });
});
test('clear: needs a note; hold released only when the LAST open flag is cleared', async () => {
  let res = mkRes(); await C.clearFlag(REQ({ params: { id: String(st.fid) }, body: { note: 'x' } }), res); assert.equal(res.code, 422);
  res = mkRes(); await C.clearFlag(REQ({ params: { id: String(st.fid) }, body: { note: 'Verified by phone, genuine' } }), res);
  assert.equal(res.code, 200); assert.equal(st.orUpdates.length, 0, 'second flag still open: still held');
  res = mkRes(); await C.clearFlag(REQ({ params: { id: String(st.fid2) }, body: { note: 'Also fine after review' } }), res);
  assert.deepEqual(st.orUpdates[0], { $unset: { 'flags.fraudHold': 1 } });
  res = mkRes(); await C.clearFlag(REQ({ params: { id: String(st.fid2) }, body: { note: 'again again' } }), res); assert.equal(res.code, 422, 'cannot clear twice');
});
test('confirm: claws back commission, voids referral, closes sibling flags; second confirm refused', async () => {
  const res = mkRes(); await C.confirmFlag(REQ({ params: { id: String(st.fid) }, body: { note: 'Self purchase proven' } }), res);
  assert.equal(res.code, 200); assert.equal(res.body.data.reversedPaise, 1000);
  assert.equal(st.created[0].entryType, 'reversal_fraud'); assert.equal(st.created[0].amountPaise, -1000);
  assert.equal(st.orUpdates[0].$set.status, 'void'); assert.equal(st.flags[1].status, 'confirmed');
  const again = mkRes(); await C.confirmFlag(REQ({ params: { id: String(st.fid) }, body: { note: 'Self purchase proven' } }), again);
  assert.equal(again.code, 422); assert.equal(st.created.length, 1);
});
test('routes: fraud resolve + profit are super_admin only; other reads include finance_manager', async () => {
  const { default: router } = await import('../../routes/referralAdminRoutes.js');
  const found = {};
  for (const l of router.stack) { if (!l.route) continue; const g = l.route.stack.map((s) => s.handle).filter((f) => f.allowedRoles); if (g.length) found[`${Object.keys(l.route.methods)[0]} ${l.route.path}`] = g[0].allowedRoles; }
  for (const k of ['post /fraud/:id/clear', 'post /fraud/:id/confirm', 'get /reports/profit']) assert.deepEqual(found[k], ['super_admin'], k);
  for (const k of ['get /fraud', 'get /reports/liability', 'get /reports/summary', 'get /reports/promoters', 'get /reports/reconciliation']) assert.deepEqual(found[k], ['super_admin', 'finance_manager'], k);
});
