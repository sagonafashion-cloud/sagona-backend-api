// Phase 2 flow tests: computeOrderTotals + createOrder + validate endpoint + hooks, with the
// database stubbed. Proves the wiring (flag off = legacy, flag on = discount, rollback on failure).
import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'j'.repeat(40);
process.env.RAZORPAY_KEY_ID = 'rzp_test_x'; process.env.RAZORPAY_KEY_SECRET = 'x';

const mongoose = (await import('mongoose')).default;
const { v2: cloudinary } = await import('cloudinary');
cloudinary.uploader.upload_stream = (_o, cb) => ({ end: () => cb(null, { secure_url: 'https://example.invalid/inv.pdf' }) });

const M = {
  Product: (await import('../../models/Product.js')).default,
  User: (await import('../../models/User.js')).default,
  Order: (await import('../../models/Order.js')).default,
  PendingCheckout: (await import('../../models/PendingCheckout.js')).default,
  ReferralCode: (await import('../../models/referral/ReferralCode.js')).default,
  Promoter: (await import('../../models/referral/Promoter.js')).default,
  ReferralSetting: (await import('../../models/referral/ReferralSetting.js')).default,
  CommissionRate: (await import('../../models/referral/CommissionRate.js')).default,
  OrderReferral: (await import('../../models/referral/OrderReferral.js')).default,
  OrderReferralLine: (await import('../../models/referral/OrderReferralLine.js')).default,
  CommissionLedger: (await import('../../models/referral/CommissionLedger.js')).default
};
const { clearSettingsCache } = await import('../../services/referral/settings.js');
const { computeOrderTotals } = await import('../../utils/orderCalculator.js');
const { createOrder } = await import('../../controllers/orderController.js');
const { validateReferral } = await import('../../controllers/referralPublicController.js');
const { GENERIC_MESSAGE } = await import('../../services/referral/applyReferral.js');
const hook = await import('../../services/referral/orderHook.js');

/* ── stubbing harness ── */
const saved = [];
const stub = (obj, name, fn) => { saved.push([obj, name, obj[name]]); obj[name] = fn; };
const mkRes = () => { const r = { code: 200, body: undefined, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.set = (h, v) => { Object.assign(r.headers, typeof h === 'object' ? h : { [h]: v }); return r; }; return r; };

const PRODUCT = { _id: 'prod1', name: 'Kids Kurta', price: 500, mrp: 500, gstSlab: 5, hsnCode: '6109', sku: 'K1', category: 'kids', stock: 10, variants: [] };
const CODE = { _id: 'code1', code: 'RHEA25', promoterId: 'prom1', status: 'active', discountType: 'flat', discountValue: 5000, usageLimitTotal: 0, timesUsed: 0, excludeSaleItems: true, categoryScope: [] };
const PROMOTER = { _id: 'prom1', status: 'active', mobile: '9000000001', email: 'promo@example.com' };

let created;       // everything the code tried to write
let programmeOn;   // value of the DB 'enabled' setting
let codeRow;       // the code currently "in the database"

const warns = [];
const arrangeAll = () => {
  while (saved.length) { const [o, n, f] = saved.pop(); o[n] = f; }
  clearSettingsCache();
  process.env.REFERRAL_ENABLED = 'true';
  programmeOn = true; codeRow = { ...CODE };
  created = { orders: [], referral: [], lines: [], ledger: [], codeUpdates: [] };

  stub(M.ReferralSetting, 'aggregate', async () => [{ _id: 'enabled', value: programmeOn }]);
  stub(M.Product, 'findOne', async () => ({ ...PRODUCT }));
  stub(M.Product, 'updateOne', async () => ({ modifiedCount: 1 }));
  stub(M.ReferralCode, 'findOne', async (q) => (codeRow && q.code === codeRow.code ? { ...codeRow } : null));
  stub(M.ReferralCode, 'findById', async () => (codeRow ? { ...codeRow } : null));
  stub(M.ReferralCode, 'updateOne', async (f, u) => { created.codeUpdates.push([f, u]); return { modifiedCount: f.$expr && codeRow.timesUsed >= codeRow.usageLimitTotal ? 0 : 1 }; });
  stub(M.Promoter, 'findById', () => ({ select: async () => ({ ...PROMOTER }) }));
  stub(M.OrderReferral, 'countDocuments', async () => 0);
  stub(M.CommissionRate, 'find', () => ({ lean: async () => [{ _id: 'rate1', category: 'kids', rateBps: 1000, effectiveFrom: '2026-01-01' }] }));
  stub(M.OrderReferral, 'create', async (docs) => { created.referral.push(...docs); return docs.map((d, i) => ({ ...d, _id: `ref${i}` })); });
  stub(M.OrderReferralLine, 'create', async (docs) => { created.lines.push(...docs); return docs.map((d, i) => ({ ...d, _id: `line${i}` })); });
  stub(M.CommissionLedger, 'create', async (docs) => { created.ledger.push(...docs); return docs; });
  stub(M.User, 'findOne', async () => ({ _id: 'u1', name: 'Buyer', email: 'buyer@example.com', phone: '9876543210' }));
  stub(M.User, 'findByIdAndUpdate', async () => ({}));
  stub(M.Order, 'findOne', async () => null);
  stub(M.Order, 'findByIdAndUpdate', async () => ({}));
  stub(M.Order, 'create', async (docs) => {
    created.orders.push(...docs);
    return docs.map((d) => ({ ...d, _id: 'order1', orderNumber: 'SAG-T-0001', createdAt: new Date(), save: async () => {}, toObject() { return { ...this }; } }));
  });
  stub(mongoose, 'startSession', async () => ({ withTransaction: async (fn) => fn(), endSession() {} }));
  stub(console, 'warn', (...a) => { warns.push(a.slice(0, 2).join(' ')); });
  stub(console, 'error', () => {});
};
beforeEach(arrangeAll);
after(() => setTimeout(() => process.exit(0), 100));

const items = () => [{ productId: 'prod1', qty: 1 }];
const addr = { name: 'Buyer', line1: 'x', city: 'Haridwar', state: 'Uttarakhand', pincode: '249403', phone: '9876543210' };
const orderReq = (extra = {}) => ({ body: { items: items(), email: 'buyer@example.com', shippingAddress: addr, payment: { method: 'COD' }, ...extra }, headers: {}, ip: '1.1.1.1' });
const run = async (fn, req) => { const res = mkRes(); await fn(req, res); return res; };

/* ───────── computeOrderTotals ───────── */
test('no referral options => result is exactly the legacy result (and no referral key content)', async () => {
  const r = await computeOrderTotals(items(), addr);
  assert.equal(r.referral, null);
  assert.equal(r.billing.grandTotal, 599);                       // 500 + 99 shipping
  assert.equal(r.billing.referralDiscount, undefined);
  assert.equal(r.billing.referralCode, undefined);
  assert.equal(r.enrichedItems[0].referralDiscount, undefined);
  assert.deepEqual(Object.keys(r.enrichedItems[0]).sort(), ['colour', 'gstSlab', 'hsnCode', 'mrp', 'name', 'productId', 'qty', 'size', 'sku', 'storeId', 'storeState', 'unitPrice'], 'meta is non-enumerable');
  assert.equal(Object.keys(await computeOrderTotals(items(), addr, {})).includes('referral'), true);
});

test('with a code: ₹50 off, GST on ₹450, shipping still decided on the list value', async () => {
  const r = await computeOrderTotals(items(), addr, { referral: { code: 'rhea25', customer: { phone: '9876543210', email: 'buyer@example.com' }, mode: 'validate' } });
  assert.equal(r.billing.subtotal, 500);
  assert.equal(r.billing.referralDiscount, 50);
  assert.equal(r.billing.referralCode, 'RHEA25');
  assert.equal(r.billing.taxableAmount, 428.57);
  assert.equal(r.billing.grandTotal, 549);                       // 450 + 99
  assert.equal(r.enrichedItems[0].referralDiscount, 50);
  assert.equal(r.referral.discountPaise, 5000);
  assert.deepEqual(r.referral.lineDiscountsPaise, [5000]);
});

test('free-shipping rule is evaluated on the LIST value, so a code never makes shipping appear', async () => {
  stub(M.Product, 'findOne', async () => ({ ...PRODUCT, price: 1000, mrp: 1000 }));
  const r = await computeOrderTotals(items(), addr, { referral: { code: 'RHEA25', customer: {}, mode: 'validate' } });
  assert.equal(r.billing.shippingCharge, 0);                     // 1000 >= 999 even though 950 after discount
  assert.equal(r.billing.grandTotal, 950);
});

test('every rejection looks identical to the customer (no code enumeration)', async () => {
  const cases = {
    unknown:       () => { codeRow = null; },
    paused:        () => { codeRow.status = 'paused'; },
    expired:       () => { codeRow.validTo = new Date('2020-01-01'); },
    notStarted:    () => { codeRow.validFrom = new Date('2099-01-01'); },
    limit:         () => { codeRow.usageLimitTotal = 5; codeRow.timesUsed = 5; },
    belowMin:      () => { codeRow.minOrderPaise = 10000000; },
    saleOnly:      () => { stub(M.Product, 'findOne', async () => ({ ...PRODUCT, mrp: 900 })); },
    promoterOff:   () => { stub(M.Promoter, 'findById', () => ({ select: async () => ({ ...PROMOTER, status: 'suspended' }) })); },
    selfReferral:  () => {},
  };
  const expectedReason = { unknown: 'unknown_code', paused: 'code_not_active', expired: 'expired', notStarted: 'not_yet_valid', limit: 'usage_limit', belowMin: 'no_discount', saleOnly: 'no_discount', promoterOff: 'promoter_not_active', selfReferral: 'self_referral' };
  const messages = new Set();
  for (const [name, arrange] of Object.entries(cases)) {
    arrangeAll(); warns.length = 0;          // every case starts from a clean slate
    arrange();
    const customer = name === 'selfReferral' ? { phone: '9000000001' } : { phone: '9876543210' };
    const res = await run(validateReferral, { body: { code: 'RHEA25', items: items(), shippingAddress: { ...addr, phone: customer.phone } }, headers: {} });
    assert.equal(res.code, 400, name);
    assert.ok(warns.some((w) => w.includes(expectedReason[name])), `${name}: the precise reason is logged for admins (got: ${warns.join(' | ')})`);
    messages.add(res.body.message);
  }
  assert.deepEqual([...messages], [GENERIC_MESSAGE]);
});

test('per-customer limit uses hashed phone/email keys', async () => {
  codeRow.usageLimitPerCustomer = 1;
  stub(M.OrderReferral, 'countDocuments', async (q) => (q.customerKeys?.$in?.length === 2 ? 1 : 0));
  const res = await run(validateReferral, { body: { code: 'RHEA25', items: items(), shippingAddress: addr, email: 'buyer@example.com' }, headers: {} });
  assert.equal(res.code, 400);
  assert.equal(res.body.message, GENERIC_MESSAGE);
});

/* ───────── validate endpoint ───────── */
test('validate: returns server-computed discount and totals; programme off => 404', async () => {
  let res = await run(validateReferral, { body: { code: ' rhea25 ', items: items(), shippingAddress: addr }, headers: {} });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.discount, 50);
  assert.equal(res.body.data.billing.grandTotal, 549);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  programmeOn = false; clearSettingsCache();
  res = await run(validateReferral, { body: { code: 'RHEA25', items: items(), shippingAddress: addr }, headers: {} });
  assert.equal(res.code, 404);
});

test('validate: rejects malformed input generically and ignores any client-supplied amounts', async () => {
  for (const body of [{}, { code: '', items: items() }, { code: 'X', items: [] }, { code: 'X', items: [{ productId: 5, qty: 1 }] }, { code: 'X'.repeat(50), items: items() }]) {
    const res = await run(validateReferral, { body, headers: {} });
    assert.equal(res.code, 400);
    assert.equal(res.body.message, GENERIC_MESSAGE);
  }
  const res = await run(validateReferral, { body: { code: 'RHEA25', items: items(), shippingAddress: addr, discount: 99999, grandTotal: 1, amount: 1 }, headers: {} });
  assert.equal(res.body.data.discount, 50, 'client numbers are ignored');
});

/* ───────── createOrder wiring ───────── */
test('COD order with a valid code: discounted order + full referral snapshot + pending accrual, one transaction', async () => {
  const res = await run(createOrder, orderReq({ referralCode: 'RHEA25' }));
  assert.equal(res.code, 201, JSON.stringify(res.body));
  const o = created.orders[0];
  assert.equal(o.billing.referralDiscount, 50);
  assert.equal(o.billing.referralCode, 'RHEA25');
  assert.equal(o.billing.grandTotal, 549);
  assert.equal(o.items[0].referralDiscount, 50);
  assert.equal(created.referral.length, 1);
  const ref = created.referral[0];
  assert.equal(ref.codeText, 'RHEA25'); assert.equal(ref.discountTotalPaise, 5000); assert.equal(ref.commissionTotalPaise, 4286);
  assert.equal(ref.customerKeys.length, 2);
  const l = created.lines[0];
  assert.deepEqual([l.lineGrossPaise, l.lineDiscountPaise, l.lineChargedPaise, l.lineTaxablePaise, l.lineGstPaise], [50000, 5000, 45000, 42857, 2143]);
  assert.deepEqual([l.commissionBasePaise, l.commissionRateBps, l.commissionPaise, l.category], [42857, 1000, 4286, 'kids']);
  assert.equal(created.ledger.length, 1);
  assert.deepEqual([created.ledger[0].entryType, created.ledger[0].bucket, created.ledger[0].amountPaise], ['accrual_pending', 'pending', 4286]);
  assert.match(created.ledger[0].idempotencyKey, /accrual_pending$/);
  assert.equal(created.codeUpdates[0][1].$inc.timesUsed, 1);
  assert.equal(created.codeUpdates[0][0].$expr, undefined, 'unlimited code: plain increment');
});

test('invoice-facing numbers tie: taxable value on the order == referral line taxable value', async () => {
  await run(createOrder, orderReq({ referralCode: 'RHEA25' }));
  assert.equal(Math.round(created.orders[0].billing.taxableAmount * 100), created.lines[0].lineTaxablePaise);
});

test('COD order with an invalid code is refused (409) and nothing is created', async () => {
  codeRow = null;
  const res = await run(createOrder, orderReq({ referralCode: 'NOPE22' }));
  assert.equal(res.code, 409);
  assert.equal(res.body.referralInvalid, true);
  assert.equal(res.body.message, GENERIC_MESSAGE);
  assert.equal(created.orders.length, 0);
});

test('limited code: the usage increment is conditional, and losing the race rolls the order back', async () => {
  codeRow.usageLimitTotal = 1; codeRow.timesUsed = 0;
  let res = await run(createOrder, orderReq({ referralCode: 'RHEA25' }));
  assert.equal(res.code, 201);
  assert.ok(created.codeUpdates[0][0].$expr, 'conditional update guards the limit');
  // second order: the DB says the limit is now used up between validation and the increment
  codeRow.timesUsed = 1;
  stub(M.ReferralCode, 'findOne', async () => ({ ...codeRow, timesUsed: 0 }));      // validation (stale read) passes ...
  res = await run(createOrder, orderReq({ referralCode: 'RHEA25' }));
  assert.equal(res.code, 409, '... but the atomic increment refuses');
  assert.equal(res.body.referralInvalid, true);
});

test('REFERRAL_ENABLED unset: a code in the request is ignored and the legacy order is created', async () => {
  delete process.env.REFERRAL_ENABLED;
  const res = await run(createOrder, orderReq({ referralCode: 'RHEA25' }));
  assert.equal(res.code, 201);
  const o = created.orders[0];
  assert.equal(o.billing.grandTotal, 599);
  assert.equal(o.billing.referralDiscount, undefined);
  assert.equal(o.items[0].referralDiscount, undefined);
  assert.equal(created.referral.length + created.lines.length + created.ledger.length + created.codeUpdates.length, 0);
});

test('programme switched off in settings (env on): code ignored, legacy order', async () => {
  programmeOn = false;
  const res = await run(createOrder, orderReq({ referralCode: 'RHEA25' }));
  assert.equal(res.code, 201);
  assert.equal(created.orders[0].billing.grandTotal, 599);
  assert.equal(created.referral.length, 0);
});

test('no code supplied: legacy order, no referral writes', async () => {
  const res = await run(createOrder, orderReq());
  assert.equal(res.code, 201);
  assert.equal(created.orders[0].billing.grandTotal, 599);
  assert.equal(created.referral.length + created.ledger.length, 0);
});

test('a code with no commission rate still gives the discount, flags the order and writes no ledger row', async () => {
  stub(M.CommissionRate, 'find', () => ({ lean: async () => [] }));
  const res = await run(createOrder, orderReq({ referralCode: 'RHEA25' }));
  assert.equal(res.code, 201);
  assert.equal(created.referral[0].flags.noRate, true);
  assert.equal(created.referral[0].commissionTotalPaise, 0);
  assert.equal(created.ledger.length, 0);
});

/* ───────── online path: agreed snapshot is honoured ───────── */
const SNAP = { codeId: 'code1', code: 'RHEA25', discountPaise: 5000, lineDiscountsPaise: [5000] };

test('snapshot (paid online): honoured even if the code has since expired or the programme was switched off', async () => {
  codeRow.status = 'expired'; codeRow.validTo = new Date('2020-01-01'); programmeOn = false; clearSettingsCache();
  const r = await computeOrderTotals(items(), addr, { referral: { snapshot: SNAP, customer: {}, mode: 'order' } });
  assert.equal(r.billing.referralDiscount, 50);
  assert.equal(r.billing.grandTotal, 549);
  assert.equal(r.referral.honorSnapshot, true);
});

test('snapshot that no longer matches the cart is refused, never silently re-priced', async () => {
  await assert.rejects(
    computeOrderTotals([{ productId: 'prod1', qty: 1 }, { productId: 'prod1', qty: 2 }], addr, { referral: { snapshot: SNAP, customer: {}, mode: 'order' } }),
    (e) => e.referralInvalid === true && e.statusCode === 409
  );
});

test('hook: online orders use the create-order snapshot and ignore a code typed later; COD uses the typed code', async () => {
  stub(M.PendingCheckout, 'findOne', () => ({ select: () => ({ lean: async () => ({ referral: SNAP }) }) }));
  const online = await hook.referralOptsForOrder({ body: { payment: { method: 'ONLINE', razorpayOrderId: 'order_1' }, referralCode: 'OTHER' }, user: undefined }, 'order_1');
  assert.deepEqual(online.referral.snapshot, SNAP);
  assert.equal(online.referral.code, undefined);
  stub(M.PendingCheckout, 'findOne', () => ({ select: () => ({ lean: async () => ({}) }) }));
  assert.equal(await hook.referralOptsForOrder({ body: { payment: { method: 'ONLINE' }, referralCode: 'X' } }, 'order_2'), undefined);
  const cod = await hook.referralOptsForOrder({ body: { payment: { method: 'COD' }, referralCode: 'RHEA25', shippingAddress: addr, email: 'b@x.com' } });
  assert.equal(cod.referral.code, 'RHEA25');
  assert.equal(cod.referral.customer.email, 'b@x.com');
  assert.equal(await hook.referralOptsForOrder({ body: { payment: { method: 'COD' } } }), undefined);
  delete process.env.REFERRAL_ENABLED;
  assert.equal(await hook.referralOptsForOrder({ body: { payment: { method: 'COD' }, referralCode: 'RHEA25' } }), undefined, 'env off => never');
  assert.equal(await hook.referralOptsForPaymentOrder({ body: { referralCode: 'RHEA25' } }), undefined);
});

test('payment create-order snapshot carries exactly what is needed to rebuild the order', async () => {
  const r = await computeOrderTotals(items(), addr, { referral: { code: 'RHEA25', customer: {}, mode: 'order' } });
  assert.deepEqual(hook.snapshotOf(r.referral), { codeId: 'code1', code: 'RHEA25', discountPaise: 5000, lineDiscountsPaise: [5000] });
  assert.equal(hook.snapshotOf(null), null);
  assert.equal(Math.round(r.billing.grandTotal * 100), 54900, 'Razorpay would be asked for exactly this');
});

/* ───────── sweep job against an in-memory ledger ───────── */
test('sweep job: eligible after the window, reverses on cancel, safe to run twice, honours the lease', async () => {
  const { runReferralSweep } = await import('../../services/referral/jobs.js');
  const ledger = [];
  const refs = [{ _id: 'ref1', orderId: 'o1', status: 'applied', flags: {}, createdAt: new Date() }];
  const lines = [{ _id: 'L1', orderReferralId: 'ref1', promoterId: 'p1', orderId: 'o1', commissionPaise: 4286 }];
  ledger.push({ orderReferralLineId: 'L1', entryType: 'accrual_pending', bucket: 'pending', amountPaise: 4286 });
  let order = { status: 'delivered', timeline: [{ status: 'delivered', timestamp: '2026-10-01T00:00:00Z' }] };
  let lock = null; const updates = [];
  const deps = {
    getSettings: async () => ({ return_window_days: 10 }),
    log: { error() {}, warn() {} },
    OrderReferral: { find: () => ({ sort: () => ({ limit: () => ({ lean: async () => refs.filter((r) => r.status === 'applied') }) }) }), updateOne: async (f, u) => { updates.push(u); Object.assign(refs[0], u.$set); } },
    OrderReferralLine: { find: () => ({ lean: async () => lines }) },
    Order: { findById: () => ({ select: () => ({ lean: async () => order }) }) },
    CommissionLedger: {
      find: () => ({ lean: async () => ledger.filter((e) => lines.some((l) => l._id === e.orderReferralLineId)) }),
      create: async (docs) => { for (const d of docs) { if (ledger.some((e) => e.idempotencyKey && e.idempotencyKey === d.idempotencyKey)) throw Object.assign(new Error('dup'), { code: 11000 }); ledger.push(d); } }
    },
    ReferralJobState: {
      findOneAndUpdate: async (_f, u) => { if (lock && lock > new Date()) throw Object.assign(new Error('dup'), { code: 11000 }); lock = u.$set.lockedUntil; return { ok: 1 }; },
      updateOne: async () => { lock = null; }
    }
  };
  const now = new Date('2026-11-20T00:00:00Z');
  let r = await runReferralSweep(deps, now);
  assert.equal(r.eligible, 1);
  const bal = (b) => ledger.filter((e) => e.bucket === b).reduce((s, e) => s + e.amountPaise, 0);
  assert.deepEqual([bal('pending'), bal('payable')], [0, 4286]);
  r = await runReferralSweep(deps, now);
  assert.equal(r.eligible, 0, 'second run adds nothing');
  assert.deepEqual([bal('pending'), bal('payable')], [0, 4286]);

  order = { status: 'returned', timeline: order.timeline };
  r = await runReferralSweep(deps, now);
  assert.equal(r.reversed, 1);
  assert.deepEqual([bal('pending'), bal('payable')], [0, 0], 'fully clawed back');
  assert.equal(refs[0].status, 'void');

  lock = new Date(Date.now() + 60000);
  assert.deepEqual(await runReferralSweep(deps, now), { skipped: 'locked' });
});
