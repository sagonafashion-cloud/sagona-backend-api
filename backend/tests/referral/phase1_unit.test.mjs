// Phase 1 unit tests: validators, crypto, rate selection, margin guard, settings, models.
// Run from backend/:  node --test tests/referral/
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.REFERRAL_ENC_KEY = 'a'.repeat(64);

const V = await import('../../utils/referralValidators.js');
const C = await import('../../utils/referralCrypto.js');
const R = await import('../../services/referral/rates.js');
const S = await import('../../services/referral/settings.js');

test('PAN / IFSC / mobile / account validators', () => {
  assert.ok(V.isValidPan('ABCDE1234F'));
  assert.ok(!V.isValidPan('abcde1234f1'));
  assert.ok(!V.isValidPan('ABCD1234FF'));
  assert.ok(V.isValidIfsc('SBIN0001234'));
  assert.ok(!V.isValidIfsc('SBIN1001234'));
  assert.ok(V.isValidMobile('9876543210'));
  assert.ok(!V.isValidMobile('1234567890'));
  assert.ok(!V.isValidMobile('98765'));
  assert.ok(V.isValidAccount('123456789012'));
  assert.ok(!V.isValidAccount('12345'));
});

test('GSTIN pattern and check digit', () => {
  assert.ok(V.isValidGstin('05CZOPK4885L2ZJ'), "store's own GSTIN must validate");
  assert.ok(V.isValidGstin('05czopk4885l2zj'), 'case-insensitive');
  assert.ok(!V.isValidGstin('05CZOPK4885L2ZK'), 'wrong check digit rejected');
  assert.ok(!V.isValidGstin('05CZOPK4885L2Z'), 'short rejected');
  const first14 = '27AAPFU0939F1Z';
  const full = first14 + V.gstinChecksum(first14);
  assert.ok(V.isValidGstin(full));
});

test('age check is exactly 18 years', () => {
  const now = new Date('2026-10-22T00:00:00Z');
  assert.ok(V.isAdult('2008-10-22', now));
  assert.ok(!V.isAdult('2008-10-23', now));
  assert.ok(!V.isAdult('not-a-date', now));
});

test('referral code normalisation and alphabet', () => {
  assert.equal(V.normalizeCode(' ab c-d '), 'ABC-D');
  assert.ok(V.isValidCode('Rhea25'));
  assert.ok(!V.isValidCode('Priya25'), 'contains the confusing letter I');
  assert.ok(!V.isValidCode('ABC'), 'too short');
  assert.ok(!V.isValidCode('A'.repeat(21)), 'too long');
  for (const ch of ['O', '0', 'I', '1', 'L']) assert.ok(!V.isValidCode(`ABCD${ch}`), `confusing char ${ch} rejected`);
});

test('scrub removes encrypted, hashed and secret keys recursively', () => {
  const out = V.scrub({ name: 'A', panEnc: 'x', panHash: 'y', panLast4: '1234', nested: { bankAccountEnc: 'z', ok: 1 }, list: [{ token: 't', k: 2 }] });
  assert.deepEqual(out, { name: 'A', panLast4: '1234', nested: { ok: 1 }, list: [{ k: 2 }] });
});

test('crypto: round trip, uniqueness, tamper detection, masking', () => {
  const a = C.encryptString('ABCDE1234F');
  const b = C.encryptString('ABCDE1234F');
  assert.notEqual(a, b, 'random IV => different ciphertext');
  assert.ok(!a.includes('ABCDE1234F'));
  assert.equal(C.decryptString(a), 'ABCDE1234F');
  const buf = Buffer.from('%PDF-1.4 fake');
  assert.deepEqual(C.decryptBuffer(C.encryptBuffer(buf)), buf);
  const tampered = C.encryptBuffer(buf);
  tampered[tampered.length - 1] ^= 0xff;
  assert.throws(() => C.decryptBuffer(tampered));
  assert.equal(C.blindIndex('X'), C.blindIndex('X'));
  assert.notEqual(C.blindIndex('X'), C.blindIndex('Y'));
  assert.equal(C.maskLast4('1234', 10), 'XXXXXX1234');
  assert.equal(C.last4('ABCDE1234F'), '234F');
});

test('crypto: missing or short key fails with a clear 503 error, never plaintext', () => {
  const saved = process.env.REFERRAL_ENC_KEY;
  process.env.REFERRAL_ENC_KEY = 'short';
  assert.equal(C.cryptoConfigured(), false);
  assert.throws(() => C.encryptString('x'), (e) => e.statusCode === 503);
  delete process.env.REFERRAL_ENC_KEY;
  assert.throws(() => C.encryptString('x'), C.CryptoConfigError);
  process.env.REFERRAL_ENC_KEY = saved;
  assert.equal(C.cryptoConfigured(), true);
  process.env.REFERRAL_ENC_KEY = 'phrase-that-is-at-least-thirty-two-chars-long';
  assert.equal(C.decryptString(C.encryptString('ok')), 'ok', 'passphrase keys are accepted');
  process.env.REFERRAL_ENC_KEY = saved;
});

const P1 = 'p1', P2 = 'p2';
const rows = [
  { _id: 'g', rateBps: 500,  effectiveFrom: '2026-01-01' },                                   // global default 5%
  { _id: 'k1', category: 'kids', rateBps: 800,  effectiveFrom: '2026-01-01' },                // kids default 8%
  { _id: 'k2', category: 'kids', rateBps: 1000, effectiveFrom: '2026-06-01' },               // kids raised to 10% from June
  { _id: 'po', promoterId: P1, category: 'kids', rateBps: 1500, effectiveFrom: '2026-03-01' },// promoter override kids 15%
  { _id: 'pa', promoterId: P1, rateBps: 700, effectiveFrom: '2026-03-01' }                    // promoter all-categories 7%
];

test('rate selection honours effective date and history (never overwritten)', () => {
  const at = (d, o = {}) => R.pickRate(rows, { category: 'kids', at: d, ...o });
  assert.equal(at('2026-05-31').rateBps, 800);
  assert.equal(at('2026-06-01').rateBps, 1000);
  assert.equal(at('2025-12-31'), null, 'before any rate existed => no rate');
});

test('rate selection tier order: promoter+category > promoter > category > global', () => {
  const at = '2026-07-01';
  assert.equal(R.pickRate(rows, { category: 'kids', promoterId: P1, at }).rateBps, 1500);
  assert.equal(R.pickRate(rows, { category: 'men', promoterId: P1, at }).rateBps, 700);
  assert.equal(R.pickRate(rows, { category: 'kids', promoterId: P2, at }).rateBps, 1000);
  assert.equal(R.pickRate(rows, { category: 'men', promoterId: P2, at }).rateBps, 500);
  assert.equal(R.pickRate(rows, { category: 'kids', promoterId: P1, at: '2026-02-01' }).rateBps, 800, 'override not yet effective');
});

test('margin guard warn vs block', () => {
  assert.deepEqual(R.marginCheck({ discountBps: 1000, commissionBps: 1000, maxPct: 40, mode: 'block' }).level, 'ok');
  const w = R.marginCheck({ discountBps: 3000, commissionBps: 1500, maxPct: 40, mode: 'warn' });
  assert.equal(w.ok, true); assert.equal(w.level, 'warn'); assert.equal(w.totalPct, 45);
  const b = R.marginCheck({ discountBps: 3000, commissionBps: 1500, maxPct: 40, mode: 'block' });
  assert.equal(b.ok, false); assert.equal(b.level, 'block');
  assert.equal(R.marginCheck({ discountBps: 2500, commissionBps: 1500, maxPct: 40, mode: 'block' }).ok, true, 'exactly at limit is allowed');
});

test('promoter activation gate needs KYC verified AND agreement signed', () => {
  assert.equal(R.canActivatePromoter({ kycStatus: 'verified', agreementStatus: 'signed' }).ok, true);
  assert.deepEqual(R.canActivatePromoter({ kycStatus: 'pending', agreementStatus: 'signed' }).missing, ['KYC must be verified']);
  assert.equal(R.canActivatePromoter({ kycStatus: 'verified', agreementStatus: 'sent' }).ok, false);
  assert.equal(R.canActivatePromoter({ kycStatus: 'rejected', agreementStatus: 'expired' }).missing.length, 2);
});

test('settings: defaults are safe and updates are validated', () => {
  const d = S.defaultSettings();
  assert.equal(d.enabled, false);
  assert.equal(d.return_window_days, 10);
  assert.equal(d.min_payout_paise, 50000);
  assert.equal(d.tds_enabled, false, 'TDS stays off until the CA confirms');
  assert.equal(d.tds_rate_bps, 0);
  assert.equal(d.reevaluate_gst_slab, false, 'slab re-evaluation ships OFF');
  assert.equal(d.gst_on_commission_bps, 1800);
  assert.ok(S.validateSettingsUpdate({ return_window_days: 14, margin_guard_mode: 'block' }).ok);
  assert.ok(!S.validateSettingsUpdate({ nope: 1 }).ok);
  assert.ok(!S.validateSettingsUpdate({ return_window_days: -1 }).ok);
  assert.ok(!S.validateSettingsUpdate({ return_window_days: '10' }).ok, 'wrong type rejected');
  assert.ok(!S.validateSettingsUpdate({ commission_base: 'WHATEVER' }).ok);
  assert.ok(!S.validateSettingsUpdate([1]).ok);
});

test('programme needs BOTH the env flag and the DB setting; env off => disabled without touching the DB', async () => {
  const saved = process.env.REFERRAL_ENABLED;
  delete process.env.REFERRAL_ENABLED;
  assert.equal(S.envEnabled(), false);
  assert.equal(await S.isProgrammeEnabled(), false);
  process.env.REFERRAL_ENABLED = 'false';
  assert.equal(await S.isProgrammeEnabled(), false);
  if (saved !== undefined) process.env.REFERRAL_ENABLED = saved; else delete process.env.REFERRAL_ENABLED;
});

test('models: sensitive fields are select:false; schema validation', async () => {
  const Promoter = (await import('../../models/referral/Promoter.js')).default;
  const ReferralCode = (await import('../../models/referral/ReferralCode.js')).default;
  const CommissionRate = (await import('../../models/referral/CommissionRate.js')).default;
  for (const f of ['panEnc', 'panHash', 'gstinEnc', 'bankAccountEnc', 'bankHash']) {
    assert.equal(Promoter.schema.path(f).options.select, false, `${f} must be select:false`);
  }
  assert.ok(Promoter.schema.path('mobile').options.unique);
  assert.ok(ReferralCode.schema.path('code').options.unique);
  assert.ok(new Promoter({ name: 'A', mobile: '9876543210' }).validateSync() === undefined);
  assert.ok(new Promoter({ name: 'A' }).validateSync().errors.mobile);
  assert.ok(new ReferralCode({ code: 'ABCD', promoterId: '507f1f77bcf86cd799439011', discountType: 'weird', discountValue: 5 }).validateSync().errors.discountType);
  assert.ok(new CommissionRate({ rateBps: 10001, effectiveFrom: new Date() }).validateSync().errors.rateBps);
  assert.ok(new CommissionRate({ rateBps: 5, effectiveFrom: new Date(), category: 'shoes' }).validateSync().errors.category);
});

test('append-only models reject updates, deletes and re-saves', async () => {
  const CommissionRate = (await import('../../models/referral/CommissionRate.js')).default;
  const ReferralSetting = (await import('../../models/referral/ReferralSetting.js')).default;
  const ReferralAuditLog = (await import('../../models/referral/ReferralAuditLog.js')).default;
  for (const M of [CommissionRate, ReferralSetting, ReferralAuditLog]) {
    await assert.rejects(() => M.updateOne({}, { $set: { x: 1 } }), /append-only/);
    await assert.rejects(() => M.deleteMany({}), /append-only/);
    await assert.rejects(() => M.findOneAndUpdate({}, { $set: { x: 1 } }), /append-only/);
    await assert.rejects(() => M.findOneAndDelete({}), /append-only/);
  }
  const doc = new CommissionRate({ rateBps: 100, effectiveFrom: new Date() });
  doc.$isNew = false;
  await assert.rejects(() => doc.save(), /append-only/);
});
