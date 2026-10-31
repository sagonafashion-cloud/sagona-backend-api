// Phase 1 handler + permission tests. No database: Mongoose model statics are stubbed.
// Run from backend/:  node --test tests/referral/*.test.mjs
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.REFERRAL_ENC_KEY = 'b'.repeat(64);
process.env.JWT_ADMIN_SECRET = 'x'.repeat(40);

const Promoter = (await import('../../models/referral/Promoter.js')).default;
const ReferralCode = (await import('../../models/referral/ReferralCode.js')).default;
const CommissionRate = (await import('../../models/referral/CommissionRate.js')).default;
const ReferralSetting = (await import('../../models/referral/ReferralSetting.js')).default;
const ReferralAuditLog = (await import('../../models/referral/ReferralAuditLog.js')).default;
const ctl = await import('../../controllers/referralAdminController.js');
const { clearSettingsCache } = await import('../../services/referral/settings.js');
const { default: router } = await import('../../routes/referralAdminRoutes.js');

/* ── tiny harness ── */
const mkRes = () => {
  const r = { code: 200, body: undefined, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.set = (h, v) => { Object.assign(r.headers, typeof h === 'object' ? h : { [h]: v }); return r; };
  return r;
};
const admin = { _id: '507f1f77bcf86cd799439011', name: 'Owner', role: 'super_admin' };
const mkReq = (body = {}, extra = {}) => ({ body, params: {}, query: {}, headers: {}, ip: '1.2.3.4', adminUser: admin, ...extra });
const call = async (fn, req) => { const res = mkRes(); await fn(req, res); return res; };

const auditLog = [];
let stored; // last created promoter doc
const orig = {};
const stub = (obj, name, fn) => { (orig[`${obj.modelName}.${name}`] ??= [obj, name, obj[name]]); obj[name] = fn; };

beforeEach(() => {
  auditLog.length = 0; stored = null; clearSettingsCache();
  for (const [obj, name, fn] of Object.values(orig)) obj[name] = fn;
  stub(ReferralAuditLog, 'create', async (e) => { auditLog.push(e); return e; });
  stub(Promoter, 'findOne', () => ({ select: async () => null }));
  stub(Promoter, 'create', async (d) => { stored = { ...d, _id: '607f1f77bcf86cd799439022', toObject() { return { ...this }; } }; return stored; });
  stub(ReferralSetting, 'aggregate', async () => []);
});

const goodBody = () => ({
  name: 'Asha Verma', mobile: '9876543210', email: 'Asha@Example.com', dob: '1998-05-10',
  pan: 'ABCDE1234F', bankAccount: '123456789012', bankIfsc: 'SBIN0001234', bankHolderName: 'Asha Verma',
  address: { line1: 'x', city: 'Haridwar', pincode: '249403' }
});

test('createPromoter encrypts PAN/bank, never returns or audits plaintext', async () => {
  const res = await call(ctl.createPromoter, mkReq(goodBody()));
  assert.equal(res.code, 201, JSON.stringify(res.body));
  assert.ok(stored.panEnc.startsWith('v1:') && !stored.panEnc.includes('ABCDE1234F'));
  assert.ok(stored.bankAccountEnc.startsWith('v1:'));
  assert.equal(stored.panLast4, '234F');
  assert.ok(stored.panHash && stored.bankHash);
  const json = JSON.stringify(res.body) + JSON.stringify(auditLog);
  for (const secret of ['ABCDE1234F', '123456789012', stored.panEnc, stored.bankAccountEnc, stored.panHash]) {
    assert.ok(!json.includes(secret), 'secret leaked into response/audit');
  }
  assert.equal(res.body.data.pan, 'XXXXXX234F');
  assert.equal(res.body.data.bankAccount, 'XXXXXXXX9012');
  assert.equal(res.body.data.bankNameMismatch, false);
  assert.equal(auditLog[0].action, 'promoter.create');
  assert.equal(stored.email, 'asha@example.com');
});

test('createPromoter rejects invalid input with 422', async () => {
  const cases = [
    [{ ...goodBody(), dob: '2015-01-01' }, /18 years/],
    [{ ...goodBody(), pan: 'BAD' }, /PAN/],
    [{ ...goodBody(), mobile: '123' }, /Mobile/],
    [{ ...goodBody(), bankIfsc: 'nope' }, /IFSC/],
    [{ ...goodBody(), bankAccount: '12' }, /9-18 digits/],
    [{ ...goodBody(), gstRegistered: true }, /GSTIN is required/],
    [{ ...goodBody(), gstRegistered: true, gstin: '05CZOPK4885L2ZK' }, /GSTIN is invalid/],
    [{ ...goodBody(), bankHolderName: undefined }, /together/],
    [{ ...goodBody(), name: undefined }, /name is required/]
  ];
  for (const [body, rx] of cases) {
    const res = await call(ctl.createPromoter, mkReq(body));
    assert.equal(res.code, 422, `${rx} => ${JSON.stringify(res.body)}`);
    assert.match(res.body.message, rx);
  }
  assert.equal(stored, null, 'nothing was created');
});

test('createPromoter blocks duplicate PAN with 409', async () => {
  stub(Promoter, 'findOne', () => ({ select: async () => ({ _id: 'other' }) }));
  const res = await call(ctl.createPromoter, mkReq(goodBody()));
  assert.equal(res.code, 409);
  assert.match(res.body.message, /already exists/);
});

test('bank holder name different from promoter name is flagged', async () => {
  const res = await call(ctl.createPromoter, mkReq({ ...goodBody(), bankHolderName: 'Someone Else' }));
  assert.equal(res.code, 201);
  assert.equal(res.body.data.bankNameMismatch, true);
});

test('encryption key missing => 503, not plaintext storage', async () => {
  const k = process.env.REFERRAL_ENC_KEY; delete process.env.REFERRAL_ENC_KEY;
  const res = await call(ctl.createPromoter, mkReq(goodBody()));
  process.env.REFERRAL_ENC_KEY = k;
  assert.equal(res.code, 503);
  assert.equal(stored, null);
});

const fakePromoter = (o = {}) => {
  const p = {
    _id: 'p1', name: 'A', status: 'pending', kycStatus: 'pending', agreementStatus: 'not_sent', strikes: [],
    toObject() { return { ...this }; }, async save() { this.saved = true; }, ...o
  };
  return p;
};

test('cannot activate until KYC verified AND agreement signed', async () => {
  const p = fakePromoter({ kycStatus: 'verified', agreementStatus: 'sent' });
  stub(Promoter, 'findById', async () => p);
  const res = await call(ctl.setPromoterStatus, mkReq({ status: 'active' }, { params: { id: 'p1' } }));
  assert.equal(res.code, 409);
  assert.match(res.body.message, /Agreement must be signed/);
  assert.equal(p.status, 'pending');
  assert.ok(!p.saved);
});

test('activation succeeds when gates pass and restores only suspension-paused codes', async () => {
  const p = fakePromoter({ kycStatus: 'verified', agreementStatus: 'signed' });
  stub(Promoter, 'findById', async () => p);
  const calls = [];
  stub(ReferralCode, 'updateMany', async (f, u) => { calls.push([f, u]); return {}; });
  const res = await call(ctl.setPromoterStatus, mkReq({ status: 'active' }, { params: { id: 'p1' } }));
  assert.equal(res.code, 200);
  assert.equal(p.status, 'active');
  assert.deepEqual(calls[0][0], { promoterId: 'p1', status: 'paused', pausedReason: 'promoter_suspended' });
  assert.equal(auditLog.at(-1).action, 'promoter.status.active');
});

test('suspending needs a reason and immediately pauses the promoter\'s active codes', async () => {
  const p = fakePromoter({ status: 'active', kycStatus: 'verified', agreementStatus: 'signed' });
  stub(Promoter, 'findById', async () => p);
  const calls = [];
  stub(ReferralCode, 'updateMany', async (f, u) => { calls.push([f, u]); return {}; });
  let res = await call(ctl.setPromoterStatus, mkReq({ status: 'suspended' }, { params: { id: 'p1' } }));
  assert.equal(res.code, 422);
  res = await call(ctl.setPromoterStatus, mkReq({ status: 'suspended', reason: 'fraud review' }, { params: { id: 'p1' } }));
  assert.equal(res.code, 200);
  assert.deepEqual(calls[0][0], { promoterId: 'p1', status: 'active' });
  assert.equal(calls[0][1].$set.status, 'paused');
  assert.equal(auditLog.at(-1).reason, 'fraud review');
});

test('terminated promoters cannot be reactivated', async () => {
  stub(Promoter, 'findById', async () => fakePromoter({ status: 'terminated', kycStatus: 'verified', agreementStatus: 'signed' }));
  const res = await call(ctl.setPromoterStatus, mkReq({ status: 'active' }, { params: { id: 'p1' } }));
  assert.equal(res.code, 409);
});

test('KYC and agreement cannot be downgraded while the promoter is active', async () => {
  const p = fakePromoter({ status: 'active', kycStatus: 'verified', agreementStatus: 'signed' });
  stub(Promoter, 'findById', async () => p);
  let res = await call(ctl.setPromoterKyc, mkReq({ kycStatus: 'rejected' }, { params: { id: 'p1' } }));
  assert.equal(res.code, 409);
  res = await call(ctl.setPromoterAgreement, mkReq({ agreementStatus: 'expired' }, { params: { id: 'p1' } }));
  assert.equal(res.code, 409);
});

test('signing an agreement records version, date and who recorded it', async () => {
  const p = fakePromoter();
  stub(Promoter, 'findById', async () => p);
  const res = await call(ctl.setPromoterAgreement, mkReq({ agreementStatus: 'signed', agreementVersion: 'v1', method: 'click_wrap' }, { params: { id: 'p1' } }));
  assert.equal(res.code, 200);
  assert.equal(p.agreementVersion, 'v1');
  assert.ok(p.agreementSignedAt instanceof Date);
  assert.equal(p.agreementAcceptance.ip, '1.2.3.4');
  assert.equal(p.agreementAcceptance.method, 'click_wrap');
});

test('reveal: needs reason + valid fields, and the audit record is written BEFORE data is returned', async () => {
  const { encryptString } = await import('../../utils/referralCrypto.js');
  const sel = { select: async () => fakePromoter({ panEnc: encryptString('ABCDE1234F') }) };
  stub(Promoter, 'findById', () => sel);
  let res = await call(ctl.revealSensitive, mkReq({ fields: ['pan'] }, { params: { id: 'p1' } }));
  assert.equal(res.code, 422, 'reason required');
  res = await call(ctl.revealSensitive, mkReq({ fields: ['passwordHash'], reason: 'x' }, { params: { id: 'p1' } }));
  assert.equal(res.code, 422, 'unknown field rejected');
  res = await call(ctl.revealSensitive, mkReq({ fields: ['pan', 'gstin'], reason: 'verify KYC' }, { params: { id: 'p1' } }));
  assert.equal(res.code, 200);
  assert.equal(res.body.data.pan, 'ABCDE1234F');
  assert.equal(res.body.data.gstin, null);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  const entry = auditLog.find((e) => e.action === 'sensitive.reveal');
  assert.equal(entry.reason, 'verify KYC');
  assert.deepEqual(entry.after.fields, ['pan', 'gstin']);
  assert.ok(!JSON.stringify(entry).includes('ABCDE1234F'), 'plaintext must not be in the audit log');
});

test('reveal returns NO data if the audit write fails', async () => {
  const { encryptString } = await import('../../utils/referralCrypto.js');
  stub(Promoter, 'findById', () => ({ select: async () => fakePromoter({ panEnc: encryptString('ABCDE1234F') }) }));
  stub(ReferralAuditLog, 'create', async () => { throw new Error('db down'); });
  const origErr = console.error; console.error = () => {};
  const res = await call(ctl.revealSensitive, mkReq({ fields: ['pan'], reason: 'r' }, { params: { id: 'p1' } }));
  console.error = origErr;
  assert.equal(res.code, 500);
  assert.ok(!JSON.stringify(res.body).includes('ABCDE1234F'));
});

test('a failed non-strict audit write does not undo the admin action', async () => {
  stub(ReferralAuditLog, 'create', async () => { throw new Error('db down'); });
  const origErr = console.error; console.error = () => {};
  const res = await call(ctl.createPromoter, mkReq(goodBody()));
  console.error = origErr;
  assert.equal(res.code, 201);
});

/* ── codes ── */
const codeBody = (o = {}) => ({ promoterId: '507f1f77bcf86cd799439033', code: 'RHEA25', discountType: 'percent', discountValue: 1000, ...o });

test('createCode: validates, applies margin guard, audits', async () => {
  stub(Promoter, 'findById', () => ({ select: async () => ({ status: 'active' }) }));
  stub(CommissionRate, 'find', () => ({ lean: async () => [{ rateBps: 1000, effectiveFrom: '2026-01-01' }] }));
  let made;
  stub(ReferralCode, 'create', async (d) => { made = d; return { ...d, toObject() { return { ...d }; } }; });

  let res = await call(ctl.createCode, mkReq(codeBody()));
  assert.equal(res.code, 201, JSON.stringify(res.body));
  assert.equal(made.code, 'RHEA25');
  assert.equal(made.discountValue, 1000);
  assert.deepEqual(res.body.warnings, []);

  res = await call(ctl.createCode, mkReq(codeBody({ code: 'bad1' })));          // contains '1'
  assert.equal(res.code, 422);
  res = await call(ctl.createCode, mkReq(codeBody({ discountValue: 10001 })));
  assert.equal(res.code, 422);
  res = await call(ctl.createCode, mkReq(codeBody({ discountType: 'bogus' })));
  assert.equal(res.code, 422);
  res = await call(ctl.createCode, mkReq(codeBody({ validFrom: '2026-12-01', validTo: '2026-11-01' })));
  assert.equal(res.code, 422);
  res = await call(ctl.createCode, mkReq(codeBody({ categoryScope: ['shoes'] })));
  assert.equal(res.code, 422);
  assert.ok(auditLog.some((e) => e.action === 'code.create'));
});

test('createCode: margin guard in warn mode warns, in block mode refuses', async () => {
  stub(Promoter, 'findById', () => ({ select: async () => ({ status: 'active' }) }));
  stub(CommissionRate, 'find', () => ({ lean: async () => [{ rateBps: 3000, effectiveFrom: '2026-01-01' }] }));
  stub(ReferralCode, 'create', async (d) => ({ ...d, toObject() { return { ...d }; } }));
  let res = await call(ctl.createCode, mkReq(codeBody({ discountValue: 2000 })));   // 20% + 30% = 50% > 40%
  assert.equal(res.code, 201);
  assert.match(res.body.warnings[0], /50%/);

  stub(ReferralSetting, 'aggregate', async () => [{ _id: 'margin_guard_mode', value: 'block' }]);
  clearSettingsCache();
  res = await call(ctl.createCode, mkReq(codeBody({ discountValue: 2000 })));
  assert.equal(res.code, 422);
  assert.match(res.body.message, /margin guard/);
  assert.equal(res.body.guard.level, 'block');
});

test('createCode refuses terminated or missing promoters', async () => {
  stub(Promoter, 'findById', () => ({ select: async () => ({ status: 'terminated' }) }));
  assert.equal((await call(ctl.createCode, mkReq(codeBody()))).code, 422);
  stub(Promoter, 'findById', () => ({ select: async () => null }));
  assert.equal((await call(ctl.createCode, mkReq(codeBody()))).code, 422);
  assert.equal((await call(ctl.createCode, mkReq(codeBody({ promoterId: 'nope' })))).code, 422);
});

test('resume refuses when the promoter is not active', async () => {
  stub(ReferralCode, 'findById', async () => ({ _id: 'c1', status: 'paused', promoterId: 'p1', toObject() { return {}; }, async save() {} }));
  stub(Promoter, 'findById', () => ({ select: async () => ({ status: 'suspended' }) }));
  const res = await call(ctl.resumeCode, mkReq({}, { params: { id: 'c1' } }));
  assert.equal(res.code, 409);
});

test('bulkCreateCodes: limits, prefix rule, unique codes', async () => {
  stub(Promoter, 'findById', () => ({ select: async () => ({ status: 'active' }) }));
  stub(CommissionRate, 'find', () => ({ lean: async () => [] }));
  const seen = new Set();
  stub(ReferralCode, 'create', async (d) => { seen.add(d.code); return d; });
  let res = await call(ctl.bulkCreateCodes, mkReq(codeBody({ count: 201 })));
  assert.equal(res.code, 422);
  res = await call(ctl.bulkCreateCodes, mkReq(codeBody({ count: 5, prefix: 'LOL' })));
  assert.equal(res.code, 422, 'L is not allowed');
  res = await call(ctl.bulkCreateCodes, mkReq(codeBody({ count: 25, prefix: 'SAG' })));
  assert.equal(res.code, 201);
  assert.equal(res.body.data.codes.length, 25);
  assert.ok(res.body.data.codes.every((c) => /^SAG[A-HJKMNP-Z2-9]{8}$/.test(c)));
  assert.equal(seen.size, 25);
});

/* ── rates ── */
test('createRate validates, guards margin, and inserts a new row (history preserved)', async () => {
  stub(ReferralCode, 'findOne', () => ({ sort: () => ({ select: () => ({ lean: async () => ({ discountValue: 1000, code: 'RHEA25' }) }) }) }));
  let made;
  stub(CommissionRate, 'create', async (d) => { made = d; return { ...d, toObject() { return { ...d }; } }; });
  let res = await call(ctl.createRate, mkReq({ category: 'kids', rateBps: 800, effectiveFrom: '2026-11-01' }));
  assert.equal(res.code, 201, JSON.stringify(res.body));
  assert.equal(made.rateBps, 800);
  assert.equal(made.category, 'kids');
  assert.equal(auditLog.at(-1).action, 'rate.create');
  for (const bad of [{ rateBps: -1 }, { rateBps: 10001 }, { rateBps: 5.5 }, { rateBps: 100, category: 'shoes' }, { rateBps: 100, effectiveFrom: 'x' }]) {
    res = await call(ctl.createRate, mkReq(bad));
    assert.equal(res.code, 422, JSON.stringify(bad));
  }
  stub(ReferralSetting, 'aggregate', async () => [{ _id: 'margin_guard_mode', value: 'block' }, { _id: 'margin_guard_max_pct', value: 15 }]);
  clearSettingsCache();
  res = await call(ctl.createRate, mkReq({ category: 'kids', rateBps: 800 }));   // 10% + 8% = 18% > 15%
  assert.equal(res.code, 422);
});

test('effectiveRate answers "which rate applied on date X"', async () => {
  stub(CommissionRate, 'find', () => ({ lean: async () => [
    { _id: 'a', category: 'kids', rateBps: 800, effectiveFrom: '2026-01-01' },
    { _id: 'b', category: 'kids', rateBps: 1000, effectiveFrom: '2026-06-01' }
  ] }));
  let res = await call(ctl.effectiveRate, mkReq({}, { query: { category: 'kids', at: '2026-03-01' } }));
  assert.equal(res.body.data.rateBps, 800);
  res = await call(ctl.effectiveRate, mkReq({}, { query: { category: 'kids', at: '2026-07-01' } }));
  assert.equal(res.body.data.rateBps, 1000);
  res = await call(ctl.effectiveRate, mkReq({}, { query: { category: 'men' } }));
  assert.equal(res.body.data, null);
});

/* ── settings ── */
test('updateSettings stores only changed keys, one append-only row each, with audit', async () => {
  const made = [];
  stub(ReferralSetting, 'create', async (d) => { made.push(d); return d; });
  let res = await call(ctl.updateSettings, mkReq({ return_window_days: 14, min_payout_paise: 50000 }));
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.data.changed, ['return_window_days'], 'unchanged value not re-stored');
  assert.equal(made.length, 1);
  assert.equal(auditLog.at(-1).action, 'setting.update');
  assert.equal(auditLog.at(-1).before, 10);
  assert.equal(auditLog.at(-1).after, 14);
  res = await call(ctl.updateSettings, mkReq({ tds_rate_bps: 'ten' }));
  assert.equal(res.code, 422);
});

/* ── permission matrix over the real router ── */
test('every route is behind adminProtect, and has a role guard; writes are super_admin only', () => {
  const layers = router.stack;
  assert.equal(layers[0].name, 'adminProtect', 'adminProtect must run before any route');
  let routes = 0;
  for (const l of layers.filter((x) => x.route)) {
    routes++;
    const verbs = Object.keys(l.route.methods).filter((m) => l.route.methods[m]);
    const guards = l.route.stack.map((s) => s.handle).filter((fn) => fn.allowedRoles);
    assert.equal(guards.length, 1, `${verbs} ${l.route.path} must have exactly one role guard`);
    const roles = guards[0].allowedRoles;
    for (const role of ['store_manager', 'content_editor', 'viewer']) assert.ok(!roles.includes(role), `${role} must not reach ${l.route.path}`);
    if (verbs.some((v) => v !== 'get')) assert.deepEqual(roles, ['super_admin'], `${verbs} ${l.route.path} must be super_admin only`);
    // downloading decrypted KYC documents is as sensitive as writing
    if (l.route.path === '/:id/documents/:docId') assert.deepEqual(roles, ['super_admin']);
  }
  assert.ok(routes >= 24, `expected the full route table, saw ${routes}`);
});

test('static paths are declared before /:id so they are not swallowed as ids', () => {
  const order = router.stack.filter((l) => l.route && l.route.methods.get).map((l) => l.route.path);
  for (const p of ['/settings', '/audit', '/rates', '/codes']) {
    assert.ok(order.indexOf(p) < order.indexOf('/:id'), `${p} must precede /:id`);
  }
});

test('role guard really blocks other roles and requires 2FA for privileged roles', async () => {
  const guard = router.stack.find((l) => l.route?.path === '/settings' && l.route.methods.put).route.stack[0].handle;
  const run = (role, tfa) => new Promise((resolve) => {
    const res = mkRes();
    guard({ adminUser: { role, twoFactorEnabled: tfa } }, res, () => resolve('next'));
    setImmediate(() => resolve(res.code));
  });
  assert.equal(await run('store_manager', true), 403);
  assert.equal(await run('finance_manager', true), 403, 'finance_manager is read-only');
  assert.equal(await run('super_admin', false), 403, '2FA is mandatory for super_admin');
  assert.equal(await run('super_admin', true), 'next');
});
