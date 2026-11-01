// Phase 5: ?ref= click counting, link report, promoter notifications, promoter portal (auth + scoping).
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'j'.repeat(40);
process.env.JWT_ADMIN_SECRET = 'a'.repeat(40);
process.env.REFERRAL_ENABLED = 'true'; delete process.env.RESEND_API_KEY;

const mongoose = (await import('mongoose')).default;
const jwt = (await import('jsonwebtoken')).default;
const N = await import('../../services/referral/notifications.js');
const R = await import('../../services/referral/reports.js');
const { defaultSettings, clearSettingsCache } = await import('../../services/referral/settings.js');
const M = {
  Setting: (await import('../../models/referral/ReferralSetting.js')).default,
  Code: (await import('../../models/referral/ReferralCode.js')).default,
  Click: (await import('../../models/referral/ReferralClickDay.js')).default,
  Promoter: (await import('../../models/referral/Promoter.js')).default,
  Login: (await import('../../models/referral/PromoterLoginCode.js')).default,
  OR: (await import('../../models/referral/OrderReferral.js')).default,
  Ledger: (await import('../../models/referral/CommissionLedger.js')).default,
  Item: (await import('../../models/referral/PayoutItem.js')).default,
  Order: (await import('../../models/Order.js')).default
};
const Pub = await import('../../controllers/referralPublicController.js');
const P = await import('../../controllers/promoterPortalController.js');
const Auth = await import('../../middleware/promoterAuth.js');
const emailSvc = await import('../../utils/emailService.js');

const saved = []; const stub = (o, n, f) => { saved.push([o, n, o[n]]); o[n] = f; };
const mkRes = () => { const r = { code: 200, body: undefined, ended: false }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.end = () => { r.ended = true; return r; }; r.set = () => r; return r; };
const oid = () => new mongoose.Types.ObjectId();
let settingsRows;
const reset = () => {
  while (saved.length) { const [o, n, f] = saved.pop(); o[n] = f; }
  clearSettingsCache(); settingsRows = [{ _id: 'enabled', value: true }, { _id: 'portal_enabled', value: true }];
  stub(M.Setting, 'aggregate', async () => settingsRows);
};
beforeEach(reset);

/* ───── click counting ───── */
test('click: active code counts once per call; unknown/paused/garbage all answer 204 identically and count nothing', async () => {
  const upserts = [];
  stub(M.Click, 'updateOne', async (f, u, o) => { upserts.push([f, u, o]); return {}; });
  const codes = { RHEA25: { _id: 'c1', promoterId: 'p1', status: 'active' }, OLD1: { _id: 'c2', promoterId: 'p1', status: 'paused' } };
  stub(M.Code, 'findOne', (q) => ({ select: () => ({ lean: async () => codes[q.code] || null }) }));
  for (const body of [{ code: 'rhea25' }, { code: 'OLD1' }, { code: 'NOPE9' }, { code: 123 }, {}, { code: 'x'.repeat(500) }]) {
    const res = mkRes(); await Pub.recordClick({ body }, res); assert.equal(res.code, 204); assert.ok(res.ended);
  }
  assert.equal(upserts.length, 1); assert.deepEqual(upserts[0][0].codeId, 'c1'); assert.deepEqual(upserts[0][1].$inc, { clicks: 1 }); assert.equal(upserts[0][2].upsert, true);
  assert.match(upserts[0][0].day, /^\d{4}-\d{2}-\d{2}$/);
});
test('click: programme off counts nothing and still answers 204', async () => {
  settingsRows = [{ _id: 'enabled', value: false }]; clearSettingsCache();
  let called = false; stub(M.Click, 'updateOne', async () => { called = true; });
  const res = mkRes(); await Pub.recordClick({ body: { code: 'RHEA25' } }, res);
  assert.equal(res.code, 204); assert.equal(called, false);
});
test('link report: clicks vs orders per code, cancelled orders excluded, conversion %, date range', () => {
  const rows = R.linkPerformance({
    clickRows: [{ codeId: 'c1', day: '2026-11-02', clicks: 40 }, { codeId: 'c1', day: '2026-10-01', clicks: 99 }, { codeId: 'c2', day: '2026-11-02', clicks: 0 }],
    refs: [{ referralCodeId: 'c1', orderId: 'o1', createdAt: '2026-11-02' }, { referralCodeId: 'c1', orderId: 'o2', createdAt: '2026-11-03' }, { referralCodeId: 'c1', orderId: 'o3', createdAt: '2026-11-03' }],
    orders: new Map([['o1', { status: 'delivered' }], ['o2', { status: 'cancelled' }], ['o3', { status: 'placed' }]]),
    codes: [{ _id: 'c1', code: 'RHEA25', promoterId: 'p1' }, { _id: 'c2', code: 'ZZ', promoterId: 'p1' }], names: new Map([['p1', 'Asha']]), from: '2026-11-01', to: '2026-12-01' });
  assert.equal(rows.length, 1); assert.deepEqual([rows[0].code, rows[0].clicks, rows[0].orders, rows[0].conversionPct, rows[0].promoter], ['RHEA25', 40, 2, 5, 'Asha']);
});

/* ───── notifications ───── */
test('events: only the right ledger entries become emails; fraud reversal is never announced', () => {
  const ev = N.collectEvents({
    ledger: [
      { _id: 1, promoterId: 'p', entryType: 'accrual_pending', amountPaise: 500 }, { _id: 2, promoterId: 'p', entryType: 'accrual_eligible', amountPaise: 500 },
      { _id: 3, promoterId: 'p', entryType: 'reversal_cancel', amountPaise: -500 }, { _id: 4, promoterId: 'p', entryType: 'reversal_fraud', amountPaise: -500 },
      { _id: 5, promoterId: 'p', entryType: 'release_pending', amountPaise: -500 }, { _id: 6, promoterId: 'p', entryType: 'accrual_pending', amountPaise: 0 }],
    payoutItems: [{ _id: 9, promoterId: 'p', status: 'paid', netPaise: 900, voucherNo: 'V1', utr: 'U1' }, { _id: 10, promoterId: 'p', status: 'approved', netPaise: 1 }] });
  assert.deepEqual(ev.map((e) => e.type), ['order_referred', 'commission_payable', 'commission_reversed', 'payout_paid']);
  assert.equal(ev[2].data.amountPaise, 500);
});
test('email: summarises amounts, escapes content, carries no customer details', () => {
  const rows = [{ data: { amountPaise: 12345 } }, { data: { amountPaise: 5000 } }];
  const m = N.buildEmail('order_referred', rows, { name: '<script>x</script>Asha' }, 'https://sagona.in/promoter.html');
  assert.match(m.subject, /2 new orders/); assert.match(m.html, /₹173\.45/); assert.ok(!m.html.includes('<script>'));
  const pay = N.buildEmail('payout_paid', [{ data: { voucherNo: 'SAG/PO/1', netPaise: 100000, utr: '<b>U1</b>' } }], { name: 'A' });
  assert.match(pay.html, /₹1,000\.00/); assert.ok(!pay.html.includes('<b>U1'));
});
const mkDeps = (over = {}) => {
  const box = []; const sent = [];
  const deps = {
    getSettings: async () => ({ ...defaultSettings(), notifications_enabled: true }),
    Ledger: { find: () => ({ select: () => ({ lean: async () => over.ledger ?? [{ _id: 'L1', promoterId: 'p1', entryType: 'accrual_pending', amountPaise: 700 }, { _id: 'L2', promoterId: 'p1', entryType: 'accrual_pending', amountPaise: 300 }] }) }) },
    PayoutItem: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
    Notification: {
      create: async (d) => { if (box.some((b) => b.key === d.key)) { const e = new Error('d'); e.code = 11000; throw e; } box.push({ _id: d.key, status: 'pending', attempts: 0, ...d }); },
      find: () => ({ limit: () => ({ lean: async () => box.filter((b) => b.status === 'pending' && b.attempts < 5).map((b) => ({ ...b })) }) }),
      updateMany: async (q, u) => { let n = 0; box.filter((b) => q._id.$in.includes(b._id) && (!q.status || b.status === q.status)).forEach((b) => { if (u.$set) Object.assign(b, u.$set); if (u.$inc) b.attempts += u.$inc.attempts; if (u.$unset) delete b.sentAt; n++; }); return { modifiedCount: n }; }
    },
    Promoter: { findById: () => ({ select: () => ({ lean: async () => over.promoter ?? { name: 'Asha', email: 'a@x.in', status: 'active', notifyEmail: true } }) }) },
    sendEmail: async (m) => { if (over.fail) throw new Error('smtp down'); sent.push(m); }, portalUrl: 'https://sagona.in/promoter.html', log: { error() {} }
  };
  return { deps, box, sent };
};
test('sweep: two events -> ONE email; running again sends nothing (idempotent)', async () => {
  const { deps, sent, box } = mkDeps();
  const a = await N.runNotificationSweep(deps); assert.equal(a.sent, 2); assert.equal(sent.length, 1); assert.match(sent[0].subject, /2 new orders/);
  assert.ok(box.every((b) => b.status === 'sent'));
  await N.runNotificationSweep(deps); assert.equal(sent.length, 1);
});
test('sweep: promoter opt-out / no email / inactive -> skipped, nothing sent', async () => {
  for (const promoter of [{ name: 'A', email: 'a@x.in', status: 'active', notifyEmail: false }, { name: 'A', status: 'active' }, { name: 'A', email: 'a@x.in', status: 'suspended' }]) {
    const { deps, sent, box } = mkDeps({ promoter }); await N.runNotificationSweep(deps);
    assert.equal(sent.length, 0); assert.ok(box.every((b) => b.status === 'skipped'));
  }
});
test('sweep: send failure keeps events pending with attempts+1 and retries; gives up after 5', async () => {
  const { deps, box } = mkDeps({ fail: true });
  await N.runNotificationSweep(deps); assert.ok(box.every((b) => b.status === 'pending' && b.attempts === 1));
  for (let i = 0; i < 6; i++) await N.runNotificationSweep(deps);
  assert.ok(box.every((b) => b.attempts === 5));
});
test('sweep: disabled setting does nothing', async () => {
  const { deps, box } = mkDeps(); deps.getSettings = async () => ({ ...defaultSettings(), notifications_enabled: false });
  assert.deepEqual(await N.runNotificationSweep(deps), { skipped: 'disabled' }); assert.equal(box.length, 0);
});

/* ───── portal auth ───── */
const PROM = { _id: oid(), name: 'Asha', email: 'asha@example.com', mobile: '9000000001', status: 'active', notifyEmail: true, panLast4: '234F', bankLast4: '1234' };
const arrangeAuth = () => {
  stub(nodeCrypto, 'randomInt', () => ++otpCounter);
  const codes = []; const mails = [];
  stub(M.Promoter, 'findOne', (q) => ({ select: () => ({ lean: async () => (q.email === PROM.email && q.status === 'active' ? { ...PROM } : null) }) }));
  stub(M.Login, 'countDocuments', async () => codes.filter((c) => c.fresh).length);
  stub(M.Login, 'updateMany', async () => { codes.forEach((c) => { c.used = true; }); return {}; });
  stub(M.Login, 'create', async (d) => { codes.push({ _id: codes.length + 1, attempts: 0, used: false, createdAt: new Date(), fresh: true, ...d }); });
  stub(M.Login, 'findOne', (q) => ({ sort: async () => codes.filter((c) => !c.used && c.expiresAt > new Date()).at(-1) || null }));
  stub(M.Login, 'updateOne', async (f, u) => { const c = codes.find((x) => x._id === f._id && (f.used === undefined || x.used === f.used)); if (!c) return { modifiedCount: 0 }; if (u.$inc) c.attempts += u.$inc.attempts; if (u.$set) Object.assign(c, u.$set); return { modifiedCount: 1 }; });
  return { codes, mails };
};
const nodeCrypto = (await import('crypto')).default;
let otpCounter = 123455;
const otpFrom = async () => String(otpCounter);          // controller's randomInt is stubbed below to this value
test('login: unknown and known emails get the SAME response; only the known one creates a code', async () => {
  const { codes } = arrangeAuth();
  const a = mkRes(); await P.requestCode({ body: { email: 'nobody@example.com' } }, a);
  const b = mkRes(); await P.requestCode({ body: { email: PROM.email } }, b);
  const c = mkRes(); await P.requestCode({ body: { email: 'not-an-email' } }, c);
  assert.deepEqual(a.body, b.body); assert.deepEqual(a.body, c.body); assert.equal(codes.length, 1);
  assert.ok(codes[0].hash && !('otp' in codes[0]), 'only a hash is stored');
});
test('login: correct code -> token; code is single use; wrong code counts attempts; 5 wrong locks it', async () => {
  const { codes } = arrangeAuth();
  await P.requestCode({ body: { email: PROM.email } }, mkRes());
  const otp = await otpFrom(codes);
  let r = mkRes(); await P.verifyCode({ body: { email: PROM.email, otp: '000000' } }, r); assert.equal(r.code, 401); assert.equal(codes[0].attempts, 1);
  r = mkRes(); await P.verifyCode({ body: { email: PROM.email, otp } }, r); assert.equal(r.code, 200); assert.ok(r.body.token);
  r = mkRes(); await P.verifyCode({ body: { email: PROM.email, otp } }, r); assert.equal(r.code, 401, 'reuse refused');
  await P.requestCode({ body: { email: PROM.email } }, mkRes());
  const otp2 = await otpFrom(codes);
  for (let i = 0; i < 5; i++) await P.verifyCode({ body: { email: PROM.email, otp: '111111' === otp2 ? '222222' : '111111' } }, mkRes());
  r = mkRes(); await P.verifyCode({ body: { email: PROM.email, otp: otp2 } }, r); assert.equal(r.code, 401, 'locked after 5 wrong tries even with the right code');
});
test('login: expired code refused; malformed input refused; same generic message everywhere', async () => {
  const { codes } = arrangeAuth();
  await P.requestCode({ body: { email: PROM.email } }, mkRes());
  const otp = await otpFrom(codes); codes[0].expiresAt = new Date(Date.now() - 1000);
  const msgs = new Set();
  for (const body of [{ email: PROM.email, otp }, { email: PROM.email, otp: 'abc' }, { email: 'nobody@example.com', otp: '123456' }, {}]) { const r = mkRes(); await P.verifyCode({ body }, r); assert.equal(r.code, 401); msgs.add(r.body.message); }
  assert.equal(msgs.size, 1);
});
test('tokens: promoter token is accepted ONLY by the portal; admin/user tokens are rejected by it', async () => {
  stub(M.Promoter, 'findById', () => ({ select: async () => ({ ...PROM }) }));
  const run = async (token) => { const req = { headers: { authorization: `Bearer ${token}` } }; const res = mkRes(); let ok = false; await Auth.promoterProtect(req, res, () => { ok = true; }); return { ok, code: res.code }; };
  assert.equal((await run(Auth.signPromoterToken(PROM))).ok, true);
  assert.equal((await run(jwt.sign({ id: 'x', type: 'admin' }, process.env.JWT_ADMIN_SECRET))).ok, false);
  assert.equal((await run(jwt.sign({ id: 'x' }, process.env.JWT_SECRET))).ok, false);
  assert.equal((await run(jwt.sign({ sub: String(PROM._id), type: 'promoter' }, process.env.JWT_SECRET, { audience: 'promoter-portal' }))).ok, false, 'wrong key');
  assert.equal((await run(jwt.sign({ sub: String(PROM._id), type: 'promoter' }, 'k', { expiresIn: -10 }))).ok, false);
  const pkey = (await import('crypto')).createHmac('sha256', process.env.JWT_SECRET).update('promoter-portal-v1').digest('hex');
  assert.equal((await run(jwt.sign({ sub: String(PROM._id), type: 'promoter' }, pkey, { audience: 'something-else' }))).ok, false, 'right key, wrong audience');
  assert.equal((await run(jwt.sign({ sub: String(PROM._id), type: 'admin' }, pkey, { audience: 'promoter-portal' }))).ok, false, 'wrong type');
  // and the promoter token is not valid as an admin token
  assert.throws(() => jwt.verify(Auth.signPromoterToken(PROM), process.env.JWT_ADMIN_SECRET));
  // suspended promoter is locked out immediately even with a valid token
  stub(M.Promoter, 'findById', () => ({ select: async () => ({ ...PROM, status: 'suspended' }) }));
  assert.equal((await run(Auth.signPromoterToken(PROM))).code, 401);
});
test('portal gate: 404 when programme or portal setting is off', async () => {
  for (const rows of [[{ _id: 'enabled', value: true }], [{ _id: 'enabled', value: false }, { _id: 'portal_enabled', value: true }]]) {
    settingsRows = rows; clearSettingsCache(); const res = mkRes(); let next = false;
    await Auth.portalEnabled({}, res, () => { next = true; }); assert.equal(res.code, 404); assert.equal(next, false);
  }
  settingsRows = [{ _id: 'enabled', value: true }, { _id: 'portal_enabled', value: true }]; clearSettingsCache();
  let next = false; await Auth.portalEnabled({}, mkRes(), () => { next = true; }); assert.ok(next);
});

/* ───── portal data: scoped to the logged-in promoter, no customer data ───── */
test('portal data: every query is scoped to the logged-in promoter; responses carry no customer fields', async () => {
  const mine = oid(); const req = (extra = {}) => ({ promoter: { ...PROM, _id: mine }, query: {}, body: {}, ...extra });
  const seen = [];
  stub(M.OR, 'find', (q) => { seen.push(q); return { sort: () => ({ limit: () => ({ select: () => ({ lean: async () => [{ orderId: 'o1', codeText: 'RHEA25', createdAt: new Date(), commissionTotalPaise: 400, status: 'applied', customerKeys: ['SECRET'], orderNumber: 'SAG-1' }] }) }) }) }; });
  stub(M.Order, 'find', () => ({ select: () => ({ lean: async () => [{ _id: 'o1', status: 'delivered', shippingAddress: { phone: '999' } }] }) }));
  let r = mkRes(); await P.orders(req(), r);
  assert.equal(String(seen[0].promoterId), String(mine));
  assert.deepEqual(Object.keys(r.body.data[0]).sort(), ['code', 'commissionPaise', 'date', 'status']);
  assert.ok(!JSON.stringify(r.body).includes('SECRET') && !JSON.stringify(r.body).includes('SAG-1'));
  assert.equal(r.body.data[0].status, 'Delivered');
  // a promoter id smuggled in the request is ignored
  seen.length = 0; r = mkRes(); await P.orders(req({ query: { promoterId: String(oid()) }, body: { promoterId: String(oid()) } }), r);
  assert.equal(String(seen[0].promoterId), String(mine));

  stub(M.Item, 'find', (q) => { seen.push(q); return { sort: () => ({ limit: () => ({ lean: async () => [{ voucherNo: 'V1', status: 'approved', grossPaise: 1, netPaise: 1, utr: 'LEAK', createdAt: new Date() }, { voucherNo: 'V2', status: 'paid', grossPaise: 1, netPaise: 1, utr: 'U2', paidAt: new Date(), createdAt: new Date() }] }) }) }; });
  r = mkRes(); await P.payouts(req(), r);
  assert.equal(String(seen.at(-1).promoterId), String(mine)); assert.equal(r.body.data[0].utr, undefined, 'bank ref only once paid'); assert.equal(r.body.data[1].utr, 'U2');

  stub(M.Code, 'find', (q) => { seen.push(q); return { select: () => ({ lean: async () => [{ code: 'RHEA25', status: 'active' }] }) }; });
  r = mkRes(); await P.codes(req(), r);
  assert.equal(String(seen.at(-1).promoterId), String(mine)); assert.equal(r.body.data[0].link, 'https://sagona.in/?ref=RHEA25');
});
test('portal me: mobile masked, no full PAN/bank; notification preference only accepts a boolean', async () => {
  let r = mkRes(); await P.me({ promoter: PROM }, r);
  assert.equal(r.body.data.mobile, 'XXXXXX0001'); assert.equal(r.body.data.panLast4, '234F'); assert.ok(!('panEnc' in r.body.data) && !('bankAccountEnc' in r.body.data));
  r = mkRes(); await P.setNotifications({ promoter: PROM, body: { notifyEmail: 'no' } }, r); assert.equal(r.code, 422);
  let upd; stub(M.Promoter, 'updateOne', async (f, u) => { upd = [f, u]; });
  r = mkRes(); await P.setNotifications({ promoter: PROM, body: { notifyEmail: false } }, r);
  assert.equal(r.code, 200); assert.deepEqual(upd[1], { $set: { notifyEmail: false } }); assert.equal(String(upd[0]._id), String(PROM._id));
});
test('routes: portal router has no write route except the email preference; everything after auth is guarded', async () => {
  const { default: router } = await import('../../routes/promoterPortalRoutes.js');
  const routes = router.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`);
  assert.deepEqual(routes.filter((r) => !r.startsWith('get')).sort(), ['post /auth/request', 'post /auth/verify', 'put /me/notifications']);
  const idx = router.stack.findIndex((l) => l.route?.path === '/me');
  const guards = router.stack.slice(0, idx).map((l) => l.handle?.name);
  assert.ok(guards.includes('promoterProtect') && guards.includes('portalEnabled'));
});
