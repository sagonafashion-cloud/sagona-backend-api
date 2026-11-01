// Phase 2 pure-logic tests: discount engine, commission maths, tax with referral discount,
// ledger lifecycle, invoice + GST report visibility. No database.
import test from 'node:test';
import assert from 'node:assert/strict';

const D = await import('../../services/referral/discount.js');
const C = await import('../../services/referral/commission.js');
const L = await import('../../services/referral/ledger.js');
const T = await import('../../utils/taxCalculator.js');
const { computeHsnRows } = await import('../../controllers/gstController.js');
const { generateInvoice } = await import('../../utils/invoiceGenerator.js');
const { PDFParse } = await import('pdf-parse');

const line = (index, rupees, qty = 1, o = {}) => ({ index, unitPaise: Math.round(rupees * 100), qty, category: 'kids', onSale: false, ...o });
const pctRule = (bps, o = {}) => ({ discountType: 'percent', discountValue: bps, excludeSaleItems: true, ...o });

/* ───────── spec worked example B (GST-inclusive, the model this store uses) ───────── */
test('Example B: MRP 500 incl. GST, discount 50, GST 5%, commission 10%', () => {
  const r = D.computeReferralDiscount([line(0, 500)], { discountType: 'flat', discountValue: 5000 });
  assert.equal(r.discountPaise, 5000);
  const charged = 50000 - r.lineDiscountsPaise[0];
  assert.equal(charged, 45000);                                    // customer pays 450.00
  const tax = C.lineTaxPaise({ chargedPaise: charged, gstSlab: 5, taxType: 'intra' });
  assert.equal(tax.taxablePaise, 42857);                           // 428.57
  assert.equal(tax.gstPaise, 2143);                                // 21.43
  const base = C.commissionBasePaise({ rule: 'NET_EX_GST', listPaise: 50000, chargedPaise: charged, gstSlab: 5, taxType: 'intra' });
  assert.equal(base, 42857);
  assert.equal(C.commissionPaise(base, 1000), 4286);               // 42.86 (rounded half up)
  assert.equal(base - C.commissionPaise(base, 1000), 38571);       // net realisation 385.71
});

test('commission base rules and half-up rounding', () => {
  const args = { listPaise: 50000, chargedPaise: 45000, gstSlab: 5, taxType: 'inter' };
  assert.equal(C.commissionBasePaise({ ...args, rule: 'LIST_EX_GST' }), 47619);   // 500/1.05
  assert.equal(C.commissionBasePaise({ ...args, rule: 'NET_INCL_GST' }), 45000);
  assert.equal(C.commissionBasePaise({ ...args, rule: 'NET_EX_GST' }), 42857);
  assert.equal(C.commissionPaise(1005, 500), 50);       // 50.25 -> 50
  assert.equal(C.commissionPaise(1010, 500), 51);       // 50.5  -> 51 (half up)
  assert.equal(C.commissionPaise(100, 0), 0);
  assert.equal(C.commissionPaise(0, 1000), 0);
});

/* ───────── discount engine ───────── */
test('percent discount, cap, minimum order, never above eligible value', () => {
  const lines = [line(0, 1000), line(1, 500)];
  assert.equal(D.computeReferralDiscount(lines, pctRule(1000)).discountPaise, 15000);                     // 10% of 1500
  assert.equal(D.computeReferralDiscount(lines, pctRule(1000, { discountCapPaise: 10000 })).discountPaise, 10000);
  assert.equal(D.computeReferralDiscount(lines, pctRule(1000, { minOrderPaise: 200000 })).reason, 'below_minimum');
  assert.equal(D.computeReferralDiscount(lines, { discountType: 'flat', discountValue: 999999 }).discountPaise, 150000, 'flat capped at the eligible total');
  assert.equal(D.computeReferralDiscount(lines, pctRule(10000)).discountPaise, 150000, '100% = whole value, no more');
  assert.equal(D.computeReferralDiscount([], pctRule(1000)).reason, 'empty_cart');
});

test('category scope and sale-item exclusion', () => {
  const lines = [line(0, 1000, 1, { category: 'kids' }), line(1, 1000, 1, { category: 'men' }), line(2, 1000, 1, { category: 'kids', onSale: true })];
  const r = D.computeReferralDiscount(lines, pctRule(1000, { categoryScope: ['kids'] }));
  assert.equal(r.discountPaise, 10000, 'only the non-sale kids line');
  assert.deepEqual(Object.keys(r.lineDiscountsPaise), ['0']);
  const all = D.computeReferralDiscount(lines, pctRule(1000, { excludeSaleItems: false }));
  assert.equal(all.discountPaise, 30000);
  assert.equal(D.computeReferralDiscount([line(0, 100, 1, { onSale: true })], pctRule(1000)).reason, 'no_eligible_items');
});

test('largest-remainder allocation: line shares always sum EXACTLY to the order discount', () => {
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let n = 0; n < 500; n++) {
    const lines = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) => line(i, Math.round((50 + rnd() * 3000) * 100) / 100, 1 + Math.floor(rnd() * 4)));
    const bps = 1 + Math.floor(rnd() * 5000);
    const r = D.computeReferralDiscount(lines, pctRule(bps));
    const sum = Object.values(r.lineDiscountsPaise).reduce((a, b) => a + b, 0);
    assert.equal(sum, r.discountPaise, `case ${n}`);
    for (const l of lines) assert.ok((r.lineDiscountsPaise[l.index] || 0) <= l.unitPaise * l.qty, 'a line never goes negative');
  }
  const r = D.computeReferralDiscount([line(0, 33.33), line(1, 33.33), line(2, 33.34)], { discountType: 'flat', discountValue: 100 });
  assert.equal(Object.values(r.lineDiscountsPaise).reduce((a, b) => a + b, 0), 100);
});

test('customer keys: stable, salted, phone/email normalised, nothing readable', () => {
  process.env.JWT_SECRET = 's'.repeat(40);
  const a = D.customerKeys({ phone: '+91 98765-43210', email: ' A@B.com ' });
  const b = D.customerKeys({ phone: '9876543210', email: 'a@b.com' });
  assert.deepEqual(a, b);
  assert.equal(a.length, 2);
  assert.ok(a.every((k) => /^[0-9a-f]{32}$/.test(k)));
  assert.deepEqual(D.customerKeys({}), []);
});

/* ───────── GST slab on the discounted value ───────── */
const S = { reevaluate_gst_slab: true, slab_threshold_paise: 250000, slab_low_rate: 5, slab_high_rate: 18 };
test('slab re-evaluation: a price that crosses the per-piece threshold after discount', () => {
  const at = (chargedPaise, qty = 1, extra = {}) => D.reevaluateSlab({ gstSlab: 18, category: 'men', chargedPaise, qty, ...extra }, S);
  assert.equal(at(260000 - 15000), 5, '₹2,600 less ₹150 = ₹2,450 per piece -> low slab');
  assert.equal(at(260000), 18, '₹2,600 stays on the high slab');
  assert.equal(at(250000), 5, 'exactly the threshold is the low slab');
  assert.equal(at(250001), 18);
  assert.equal(at(2 * 245000, 2), 5, 'per PIECE, not per line');
  assert.equal(at(245000, 1, { category: 'accessories' }), 18, 'non-apparel untouched');
  assert.equal(D.reevaluateSlab({ gstSlab: 12, category: 'men', chargedPaise: 100 }, S), 12, 'slabs other than low/high untouched');
  assert.equal(D.reevaluateSlab({ gstSlab: 18, category: 'men', chargedPaise: 245000, qty: 1 }, { ...S, reevaluate_gst_slab: false }), 18, 'OFF by default');
});

/* ───────── tax calculator + helper ───────── */
test('chargedLineAmount equals unitPrice x qty when there is no referral discount', () => {
  assert.equal(T.chargedLineAmount({ unitPrice: 333, qty: 3 }), 999);
  assert.equal(T.chargedLineAmount({ unitPrice: 333, qty: 3, referralDiscount: 0 }), 999);
  assert.equal(T.chargedLineAmount({ unitPrice: 500, qty: 1, referralDiscount: 50 }), 450);
  assert.equal(T.chargedLineAmount({ unitPrice: 199.99, qty: 3, referralDiscount: 0.01 }), 599.96);
});

test('calculateTax: discount reduces taxable value and total, list subtotal is kept', () => {
  const base = [{ unitPrice: 500, qty: 1, gstSlab: 5, mrp: 500 }];
  const legacy = T.calculateTax(base, 'Uttarakhand', 'Uttarakhand');
  const withRef = T.calculateTax([{ ...base[0], referralDiscount: 50 }], 'Uttarakhand', 'Uttarakhand');
  assert.equal(legacy.referralDiscount, undefined, 'no new key on legacy results');
  assert.equal(legacy.grandTotal, 500);
  assert.equal(withRef.subtotal, 500);                 // list value
  assert.equal(withRef.grandTotal, 450);               // what the customer pays
  assert.equal(withRef.referralDiscount, 50);
  assert.equal(withRef.taxableAmount, 428.57);
  assert.equal(withRef.cgst + withRef.sgst, 21.42);    // 2 x 10.71 (legacy per-half rounding)
  const inter = T.calculateTax([{ ...base[0], referralDiscount: 50 }], 'Uttarakhand', 'Delhi');
  assert.equal(inter.igst, 21.43);
});

/* ───────── invoice and GST report must see the discounted value ───────── */
const pdfText = async (order) => {
  const p = new PDFParse({ data: new Uint8Array(await generateInvoice(order, null)) });
  const r = await p.getText(); await p.destroy?.();
  return r.text.replace(/\s+/g, ' ');
};
const refOrder = () => {
  const items = [{ name: 'Kurta', unitPrice: 500, qty: 1, gstSlab: 5, mrp: 500, hsnCode: '6109', referralDiscount: 50 }];
  const tax = T.calculateTax(items, 'Uttarakhand', 'Uttarakhand');
  return {
    orderNumber: 'SAG-TEST-1', createdAt: '2026-11-02T10:00:00Z', taxType: 'intra', items,
    customer: { name: 'QA' }, shippingAddress: { name: 'QA', state: 'Uttarakhand' }, payment: { method: 'COD', status: 'pending' },
    billing: { subtotal: tax.subtotal, referralDiscount: 50, referralCode: 'RHEA25', shippingCharge: 99, taxableAmount: tax.taxableAmount, cgst: tax.cgst, sgst: tax.sgst, igst: 0, grandTotal: tax.grandTotal + 99 }
  };
};

test('invoice shows the code, the discount line and GST on the DISCOUNTED value', async () => {
  const t = await pdfText(refOrder());
  assert.match(t, /Referral discount \(RHEA25\)/);
  assert.match(t, /-Rs\. 50\.00/);
  assert.match(t, /Rs\. 450\.00 Rs\. 428\.57/, 'line price 450.00 and taxable 428.57');
  assert.match(t, /Grand Total Rs\. 549\.00/);        // 450 + 99 shipping
  assert.ok(!/Rs\. 500\.00 Rs\. 476\.19/.test(t), 'must not tax the undiscounted price');
});

test('invoice without a referral is unchanged (no discount row)', async () => {
  const o = refOrder(); delete o.items[0].referralDiscount; o.billing = { ...o.billing, referralDiscount: undefined, referralCode: undefined };
  const t = await pdfText(o);
  assert.ok(!/Referral discount/.test(t));
});

test('GST HSN report taxable value uses the discounted amount (ties to the invoice)', () => {
  const o = refOrder();
  const [row] = computeHsnRows([{ ...o, _gstSign: 1 }]);
  assert.equal(row.taxableAmt, 428.57);
  assert.equal(row.cgst + row.sgst + row.igst > 0, true);
  const plain = computeHsnRows([{ ...o, items: [{ ...o.items[0], referralDiscount: undefined }], _gstSign: 1 }]);
  assert.equal(plain[0].taxableAmt, 476.19);
  const rev = computeHsnRows([{ ...o, _gstSign: -1 }]);       // a later return nets the same discounted value out
  assert.equal(rev[0].taxableAmt, -428.57);
});

/* ───────── ledger lifecycle ───────── */
const NOW = new Date('2026-11-20T00:00:00Z');
const lineRow = (id, c) => ({ _id: id, promoterId: 'p1', orderId: 'o1', commissionPaise: c });
const accrual = (id, c) => ({ orderReferralLineId: id, entryType: 'accrual_pending', bucket: 'pending', amountPaise: c });
const delivered = (iso) => ({ status: 'delivered', timeline: [{ status: 'placed', timestamp: '2026-11-01T00:00:00Z' }, { status: 'delivered', timestamp: iso }] });
const sumBucket = (rows, b) => rows.filter((r) => r.bucket === b).reduce((s, r) => s + r.amountPaise, 0);
const apply = (existing, entries) => [...existing, ...entries];

test('ledger: nothing moves while the order is not delivered or the window is open', () => {
  const lines = [lineRow('l1', 4286)];
  const ex = [accrual('l1', 4286)];
  assert.deepEqual(L.deriveSweepEntries({ lines, existing: ex, order: { status: 'shipped' }, windowDays: 10, now: NOW }).entries, []);
  assert.deepEqual(L.deriveSweepEntries({ lines, existing: ex, order: delivered('2026-11-15T00:00:00Z'), windowDays: 10, now: NOW }).entries, [], '5 days after delivery: still inside the window');
  assert.deepEqual(L.deriveSweepEntries({ lines, existing: ex, order: { ...delivered('2026-11-01T00:00:00Z'), status: 'return_requested' }, windowDays: 10, now: NOW }).entries, [], 'return requested: hold');
});

test('ledger: window over => pending moves to payable, exactly once', () => {
  const lines = [lineRow('l1', 4286)];
  let ex = [accrual('l1', 4286)];
  const r = L.deriveSweepEntries({ lines, existing: ex, order: delivered('2026-11-05T00:00:00Z'), windowDays: 10, now: NOW });
  assert.equal(r.outcome, 'eligible');
  assert.deepEqual(r.entries.map((e) => e.entryType), ['release_pending', 'accrual_eligible']);
  ex = apply(ex, r.entries);
  assert.equal(sumBucket(ex, 'pending'), 0);
  assert.equal(sumBucket(ex, 'payable'), 4286);
  assert.deepEqual(L.deriveSweepEntries({ lines, existing: ex, order: delivered('2026-11-05T00:00:00Z'), windowDays: 10, now: NOW }).entries, [], 'idempotent');
  assert.deepEqual(new Set(r.entries.map((e) => e.idempotencyKey)).size, 2);
});

test('ledger: fraud hold blocks eligibility', () => {
  const r = L.deriveSweepEntries({ lines: [lineRow('l1', 100)], existing: [accrual('l1', 100)], order: delivered('2026-10-01T00:00:00Z'), windowDays: 10, held: true, now: NOW });
  assert.deepEqual(r.entries, []);
});

test('ledger: cancel before eligibility reverses inside the pending bucket (balance back to zero)', () => {
  const lines = [lineRow('l1', 4286), lineRow('l2', 1000)];
  let ex = [accrual('l1', 4286), accrual('l2', 1000)];
  const r = L.deriveSweepEntries({ lines, existing: ex, order: { status: 'cancelled' }, windowDays: 10, now: NOW });
  assert.equal(r.outcome, 'reversed');
  assert.ok(r.entries.every((e) => e.entryType === 'reversal_cancel' && e.bucket === 'pending'));
  ex = apply(ex, r.entries);
  assert.equal(sumBucket(ex, 'pending'), 0);
  assert.equal(sumBucket(ex, 'payable'), 0);
  assert.deepEqual(L.deriveSweepEntries({ lines, existing: ex, order: { status: 'cancelled' }, windowDays: 10, now: NOW }).entries, [], 'no double reversal');
});

test('ledger: return AFTER eligibility claws back from payable', () => {
  const lines = [lineRow('l1', 4286)];
  let ex = [accrual('l1', 4286)];
  ex = apply(ex, L.deriveSweepEntries({ lines, existing: ex, order: delivered('2026-11-01T00:00:00Z'), windowDays: 10, now: NOW }).entries);
  assert.equal(sumBucket(ex, 'payable'), 4286);
  const r = L.deriveSweepEntries({ lines, existing: ex, order: { status: 'returned' }, windowDays: 10, now: NOW });
  assert.equal(r.entries[0].entryType, 'reversal_return');
  assert.equal(r.entries[0].bucket, 'payable');
  ex = apply(ex, r.entries);
  assert.equal(sumBucket(ex, 'payable'), 0);
  assert.equal(sumBucket(ex, 'pending'), 0);
});

test('ledger: zero-commission lines produce nothing; deliveredAt picks the latest delivery', () => {
  assert.deepEqual(L.deriveSweepEntries({ lines: [lineRow('l1', 0)], existing: [], order: { status: 'cancelled' }, windowDays: 10, now: NOW }).entries, []);
  assert.equal(L.deliveredAt({ shipments: [{ deliveredAt: '2026-11-02' }, { deliveredAt: '2026-11-04' }] }).toISOString().slice(0, 10), '2026-11-04');
  assert.equal(L.deliveredAt({ timeline: [] }), null);
  assert.equal(L.balances([{ bucket: 'pending', amountPaise: 5 }, { bucket: 'payable', amountPaise: 7 }, { bucket: 'payable', amountPaise: -2 }]).payable, 5);
});
