import mongoose from 'mongoose';
import Promoter from '../models/referral/Promoter.js';
import PromoterDocument from '../models/referral/PromoterDocument.js';
import ReferralCode from '../models/referral/ReferralCode.js';
import CommissionRate from '../models/referral/CommissionRate.js';
import ReferralSetting from '../models/referral/ReferralSetting.js';
import ReferralAuditLog from '../models/referral/ReferralAuditLog.js';
import OrderReferral from '../models/referral/OrderReferral.js';
import CommissionLedger from '../models/referral/CommissionLedger.js';
import Order from '../models/Order.js';
import { audit } from '../services/referral/audit.js';
import { getSettings, clearSettingsCache, validateSettingsUpdate, isProgrammeEnabled, SETTING_DEFS } from '../services/referral/settings.js';
import { pickRate, marginCheck, canActivatePromoter } from '../services/referral/rates.js';
import {
  encryptString, decryptString, encryptBuffer, decryptBuffer, blindIndex, last4, maskLast4, cryptoConfigured, CryptoConfigError
} from '../utils/referralCrypto.js';
import {
  isValidPan, isValidGstin, isValidIfsc, isValidMobile, isValidAccount, isAdult,
  normalizeCode, isValidCode, CODE_ALPHABET, COMMISSION_CATEGORIES
} from '../utils/referralValidators.js';
import { isAllowedFileSignature } from '../utils/fileValidation.js';
import crypto from 'crypto';

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isId = (v) => mongoose.isValidObjectId(v);
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const bad = (msg, extra) => new HttpError(422, msg, extra);

// Wraps a handler so thrown errors become clean JSON responses.
const h = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ success: false, message: err.message, ...(err.extra || {}) });
    if (err instanceof CryptoConfigError) return res.status(503).json({ success: false, message: err.message });
    if (err?.code === 11000) return res.status(409).json({ success: false, message: 'A record with these details already exists' });
    if (err?.name === 'ValidationError') return res.status(422).json({ success: false, message: err.message });
    console.error('[referral admin]', err);
    res.status(500).json({ success: false, message: 'Request failed' });
  }
};

const page = (q) => {
  const p = Math.max(1, parseInt(q.page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(q.limit) || 20));
  return { page: p, limit: l, skip: (p - 1) * l };
};

/* ─────────────────────────── DTOs ─────────────────────────── */

export function promoterDTO(p) {
  const o = typeof p.toObject === 'function' ? p.toObject() : { ...p };
  return {
    _id: o._id,
    name: o.name, mobile: o.mobile, email: o.email, address: o.address, stateCode: o.stateCode, dob: o.dob,
    pan: o.panLast4 ? maskLast4(o.panLast4, 10) : null, panMissing: !o.panLast4,
    gstRegistered: !!o.gstRegistered, gstin: o.gstinLast4 ? maskLast4(o.gstinLast4, 15) : null,
    bankAccount: o.bankLast4 ? maskLast4(o.bankLast4, 12) : null, bankIfsc: o.bankIfsc, bankHolderName: o.bankHolderName,
    bankNameMismatch: !!(o.bankHolderName && normName(o.bankHolderName) !== normName(o.name)),
    socialHandles: o.socialHandles, audienceSize: o.audienceSize, notes: o.notes,
    status: o.status, kycStatus: o.kycStatus, kycNotes: o.kycNotes,
    agreementStatus: o.agreementStatus, agreementVersion: o.agreementVersion, agreementSignedAt: o.agreementSignedAt,
    agreementFileRef: o.agreementFileRef,
    tdsApplicable: !!o.tdsApplicable, gstOnCommissionApplicable: !!o.gstOnCommissionApplicable,
    strikes: o.strikes, createdAt: o.createdAt, updatedAt: o.updatedAt
  };
}

/* ─────────────────────────── ping / flags ─────────────────────────── */

export const ping = h(async (req, res) => {
  res.json({
    success: true,
    data: {
      programmeEnabled: await isProgrammeEnabled(),
      encryptionConfigured: cryptoConfigured(),
      role: req.adminUser.role,
      canWrite: req.adminUser.role === 'super_admin'
    }
  });
});

/* ─────────────────────────── promoters ─────────────────────────── */

// Builds the encrypted/derived field set from plain input. `partial` = update mode.
async function buildSensitive(body, existingId, partial) {
  const set = {};
  if (body.pan !== undefined && body.pan !== '') {
    const pan = String(body.pan).toUpperCase().trim();
    if (!isValidPan(pan)) throw bad('PAN format is invalid');
    const hash = blindIndex(pan);
    const dup = await Promoter.findOne({ panHash: hash, ...(existingId ? { _id: { $ne: existingId } } : {}) }).select('_id');
    if (dup) throw new HttpError(409, 'A promoter with this PAN already exists');
    Object.assign(set, { panEnc: encryptString(pan), panLast4: last4(pan), panHash: hash });
  }
  if (body.gstin !== undefined && body.gstin !== '') {
    const g = String(body.gstin).toUpperCase().trim();
    if (!isValidGstin(g)) throw bad('GSTIN is invalid (pattern or check digit)');
    Object.assign(set, { gstinEnc: encryptString(g), gstinLast4: last4(g) });
  }
  if (body.bankAccount !== undefined && body.bankAccount !== '') {
    const a = String(body.bankAccount).replace(/\s+/g, '');
    if (!isValidAccount(a)) throw bad('Bank account number must be 9-18 digits');
    const hash = blindIndex(a);
    const dup = await Promoter.findOne({ bankHash: hash, ...(existingId ? { _id: { $ne: existingId } } : {}) }).select('_id');
    if (dup) throw new HttpError(409, 'A promoter with this bank account already exists');
    Object.assign(set, { bankAccountEnc: encryptString(a), bankLast4: last4(a), bankHash: hash });
  }
  return set;
}

function plainFields(body, existing) {
  const set = {};
  if (body.name !== undefined) {
    const n = String(body.name).trim();
    if (n.length < 2 || n.length > 120) throw bad('Name must be 2-120 characters');
    set.name = n;
  }
  if (body.mobile !== undefined) {
    const m = String(body.mobile).trim();
    if (!isValidMobile(m)) throw bad('Mobile must be a valid 10-digit Indian number');
    set.mobile = m;
  }
  if (body.email !== undefined) {
    const e = String(body.email).trim().toLowerCase();
    if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw bad('Email is invalid');
    set.email = e || undefined;
  }
  if (body.dob !== undefined) {
    if (!isAdult(body.dob)) throw bad('Promoter must be at least 18 years old (valid date of birth required)');
    set.dob = new Date(body.dob);
  }
  if (body.address !== undefined && typeof body.address === 'object') {
    const a = body.address;
    set.address = {
      line1: String(a.line1 || '').slice(0, 200), line2: String(a.line2 || '').slice(0, 200),
      city: String(a.city || '').slice(0, 80), pincode: String(a.pincode || '').slice(0, 6)
    };
  }
  if (body.stateCode !== undefined) set.stateCode = String(body.stateCode).slice(0, 2);
  if (body.gstRegistered !== undefined) set.gstRegistered = !!body.gstRegistered;
  if (body.bankIfsc !== undefined && body.bankIfsc !== '') {
    if (!isValidIfsc(body.bankIfsc)) throw bad('IFSC is invalid');
    set.bankIfsc = String(body.bankIfsc).toUpperCase().trim();
  }
  if (body.bankHolderName !== undefined) set.bankHolderName = String(body.bankHolderName).trim().slice(0, 120);
  if (Array.isArray(body.socialHandles)) {
    set.socialHandles = body.socialHandles.slice(0, 10).map((s) => ({
      platform: String(s.platform || '').slice(0, 30), handle: String(s.handle || '').slice(0, 100)
    }));
  }
  if (body.audienceSize !== undefined) {
    const n = Number(body.audienceSize);
    if (!Number.isFinite(n) || n < 0) throw bad('Audience size must be a non-negative number');
    set.audienceSize = Math.floor(n);
  }
  if (body.notes !== undefined) set.notes = String(body.notes).slice(0, 2000);
  if (body.tdsApplicable !== undefined) set.tdsApplicable = !!body.tdsApplicable;
  if (body.gstOnCommissionApplicable !== undefined) set.gstOnCommissionApplicable = !!body.gstOnCommissionApplicable;
  return set;
}

export const createPromoter = h(async (req, res) => {
  const b = req.body || {};
  for (const f of ['name', 'mobile', 'dob']) if (b[f] === undefined || b[f] === '') throw bad(`${f} is required`);
  const set = { ...plainFields(b), ...(await buildSensitive(b, null, false)) };
  if (set.gstRegistered && !set.gstinLast4) throw bad('GSTIN is required when the promoter is GST-registered');
  if ((b.bankAccount || set.bankIfsc || set.bankHolderName) && !(set.bankLast4 && set.bankIfsc && set.bankHolderName)) {
    throw bad('Bank details need account number, IFSC and account holder name together');
  }
  const doc = await Promoter.create({ ...set, createdBy: req.adminUser._id });
  const dto = promoterDTO(doc);
  await audit(req, { action: 'promoter.create', entity: 'Promoter', entityId: doc._id, after: dto });
  res.status(201).json({ success: true, data: dto });
});

export const listPromoters = h(async (req, res) => {
  const { page: pg, limit, skip } = page(req.query);
  const f = {};
  if (req.query.status) f.status = String(req.query.status);
  if (req.query.kycStatus) f.kycStatus = String(req.query.kycStatus);
  if (req.query.gstRegistered === 'true') f.gstRegistered = true;
  if (req.query.gstRegistered === 'false') f.gstRegistered = false;
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 60)), 'i');
    f.$or = [{ name: rx }, { mobile: rx }, { email: rx }];
  }
  const [rows, total] = await Promise.all([
    Promoter.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Promoter.countDocuments(f)
  ]);
  res.json({ success: true, data: rows.map(promoterDTO), total, page: pg, limit });
});

export const getPromoter = h(async (req, res) => {
  const p = await Promoter.findById(req.params.id);
  if (!p) throw new HttpError(404, 'Promoter not found');
  const [codes, docs] = await Promise.all([
    ReferralCode.find({ promoterId: p._id }).sort({ createdAt: -1 }).lean(),
    PromoterDocument.find({ promoterId: p._id }).sort({ createdAt: -1 }).lean()
  ]);
  res.json({ success: true, data: { ...promoterDTO(p), codes, documents: docs.map(({ gridFsId, ...d }) => d) } });
});

export const updatePromoter = h(async (req, res) => {
  const p = await Promoter.findById(req.params.id);
  if (!p) throw new HttpError(404, 'Promoter not found');
  const before = promoterDTO(p);
  const b = req.body || {};
  const set = { ...plainFields(b), ...(await buildSensitive(b, p._id, true)) };
  Object.assign(p, set);
  if (p.gstRegistered && !p.gstinLast4) throw bad('GSTIN is required when the promoter is GST-registered');
  await p.save();
  const dto = promoterDTO(p);
  await audit(req, { action: 'promoter.update', entity: 'Promoter', entityId: p._id, before, after: dto });
  res.json({ success: true, data: dto });
});

export const setPromoterStatus = h(async (req, res) => {
  const { status, reason } = req.body || {};
  if (!['pending', 'active', 'suspended', 'terminated'].includes(status)) throw bad('Invalid status');
  const p = await Promoter.findById(req.params.id);
  if (!p) throw new HttpError(404, 'Promoter not found');
  if (p.status === 'terminated' && status !== 'terminated') throw new HttpError(409, 'A terminated promoter cannot be reactivated; create a new record');
  if (status === 'active') {
    const gate = canActivatePromoter(p);
    if (!gate.ok) throw new HttpError(409, `Cannot activate: ${gate.missing.join('; ')}`, { missing: gate.missing });
  }
  if (['suspended', 'terminated'].includes(status) && !String(reason || '').trim()) throw bad('A reason is required to suspend or terminate');
  const before = promoterDTO(p);
  p.status = status;
  await p.save();

  // Suspending / terminating immediately deactivates the promoter's codes;
  // re-activating restores only the codes that were paused because of suspension.
  if (['suspended', 'terminated'].includes(status)) {
    await ReferralCode.updateMany({ promoterId: p._id, status: 'active' }, { $set: { status: 'paused', pausedReason: 'promoter_suspended' } });
  } else if (status === 'active') {
    await ReferralCode.updateMany({ promoterId: p._id, status: 'paused', pausedReason: 'promoter_suspended' }, { $set: { status: 'active' }, $unset: { pausedReason: 1 } });
  }
  const dto = promoterDTO(p);
  await audit(req, { action: `promoter.status.${status}`, entity: 'Promoter', entityId: p._id, before, after: dto, reason });
  res.json({ success: true, data: dto });
});

export const setPromoterKyc = h(async (req, res) => {
  const { kycStatus, kycNotes } = req.body || {};
  if (!['pending', 'verified', 'rejected'].includes(kycStatus)) throw bad('Invalid KYC status');
  const p = await Promoter.findById(req.params.id);
  if (!p) throw new HttpError(404, 'Promoter not found');
  if (p.status === 'active' && kycStatus !== 'verified') throw new HttpError(409, 'Suspend the promoter before changing KYC away from verified');
  const before = promoterDTO(p);
  p.kycStatus = kycStatus;
  if (kycNotes !== undefined) p.kycNotes = String(kycNotes).slice(0, 1000);
  await p.save();
  const dto = promoterDTO(p);
  await audit(req, { action: 'promoter.kyc', entity: 'Promoter', entityId: p._id, before, after: dto });
  res.json({ success: true, data: dto });
});

export const setPromoterAgreement = h(async (req, res) => {
  const { agreementStatus, agreementVersion, signedAt, method, documentId } = req.body || {};
  if (!['not_sent', 'sent', 'signed', 'expired'].includes(agreementStatus)) throw bad('Invalid agreement status');
  const p = await Promoter.findById(req.params.id);
  if (!p) throw new HttpError(404, 'Promoter not found');
  if (p.status === 'active' && agreementStatus !== 'signed') throw new HttpError(409, 'Suspend the promoter before moving the agreement away from signed');
  const before = promoterDTO(p);
  if (agreementStatus === 'signed') {
    if (!agreementVersion) throw bad('Agreement version is required');
    const when = signedAt ? new Date(signedAt) : new Date();
    if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 86400000) throw bad('Signed date is invalid');
    p.agreementVersion = String(agreementVersion).slice(0, 20);
    p.agreementSignedAt = when;
    p.agreementAcceptance = {
      method: ['esign', 'uploaded_pdf', 'click_wrap'].includes(method) ? method : 'uploaded_pdf',
      recordedBy: String(req.adminUser._id), ip: req.ip, userAgent: req.headers['user-agent']
    };
    if (documentId) {
      if (!isId(documentId)) throw bad('Invalid documentId');
      const d = await PromoterDocument.findOne({ _id: documentId, promoterId: p._id, type: 'agreement' }).select('_id');
      if (!d) throw bad('Agreement document not found for this promoter');
      p.agreementFileRef = d._id;
    }
  }
  p.agreementStatus = agreementStatus;
  await p.save();
  const dto = promoterDTO(p);
  await audit(req, { action: 'promoter.agreement', entity: 'Promoter', entityId: p._id, before, after: dto });
  res.json({ success: true, data: dto });
});

export const addStrike = h(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) throw bad('A reason is required');
  const p = await Promoter.findById(req.params.id);
  if (!p) throw new HttpError(404, 'Promoter not found');
  p.strikes.push({ reason: reason.slice(0, 300), by: String(req.adminUser._id) });
  await p.save();
  await audit(req, { action: 'promoter.strike', entity: 'Promoter', entityId: p._id, reason });
  res.json({ success: true, data: promoterDTO(p) });
});

// Decrypts and returns full PAN / GSTIN / bank account. The audit entry is
// written FIRST (strict): no audit record, no data.
export const revealSensitive = h(async (req, res) => {
  const fields = Array.isArray(req.body?.fields) ? req.body.fields : [];
  const reason = String(req.body?.reason || '').trim();
  if (!reason) throw bad('A reason is required to reveal sensitive details');
  const allowed = { pan: 'panEnc', gstin: 'gstinEnc', bankAccount: 'bankAccountEnc' };
  if (!fields.length || fields.some((f) => !(f in allowed))) throw bad('fields must be a non-empty subset of pan, gstin, bankAccount');
  const p = await Promoter.findById(req.params.id).select('+panEnc +gstinEnc +bankAccountEnc');
  if (!p) throw new HttpError(404, 'Promoter not found');
  await audit(req, { action: 'sensitive.reveal', entity: 'Promoter', entityId: p._id, after: { fields }, reason }, { strict: true });
  const data = {};
  for (const f of fields) data[f] = p[allowed[f]] ? decryptString(p[allowed[f]]) : null;
  res.set('Cache-Control', 'no-store').json({ success: true, data });
});

/* ─────────────────────────── documents (encrypted, GridFS) ─────────────────────────── */

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'promoter_docs' });
const DOC_TYPES = ['pan', 'bank_proof', 'gst_certificate', 'id_proof', 'agreement'];

export const uploadDocument = h(async (req, res) => {
  const p = await Promoter.findById(req.params.id).select('_id');
  if (!p) throw new HttpError(404, 'Promoter not found');
  const type = String(req.body?.type || '');
  if (!DOC_TYPES.includes(type)) throw bad(`type must be one of ${DOC_TYPES.join(', ')}`);
  if (!req.file?.buffer?.length) throw bad('A file is required');
  if (!isAllowedFileSignature(req.file.buffer, ['jpeg', 'png', 'pdf'])) throw bad('Only PDF, JPEG or PNG files are accepted');
  const mime = req.file.buffer[0] === 0x25 ? 'application/pdf' : req.file.buffer[0] === 0x89 ? 'image/png' : 'image/jpeg';
  const enc = encryptBuffer(req.file.buffer);
  const safeName = String(req.file.originalname || 'document').replace(/[^\w.\-]+/g, '_').slice(0, 100);

  const gridFsId = await new Promise((resolve, reject) => {
    const up = bucket().openUploadStream(`${p._id}_${type}_${Date.now()}`, { metadata: { promoterId: String(p._id), type } });
    up.on('error', reject);
    up.on('finish', () => resolve(up.id));
    up.end(enc);
  });
  const doc = await PromoterDocument.create({
    promoterId: p._id, type, filename: safeName, mime, size: req.file.buffer.length, gridFsId, uploadedBy: req.adminUser._id
  });
  await audit(req, { action: 'document.upload', entity: 'Document', entityId: doc._id, after: { promoterId: p._id, type, filename: safeName, size: doc.size } });
  res.status(201).json({ success: true, data: { _id: doc._id, type, filename: safeName, mime, size: doc.size, createdAt: doc.createdAt } });
});

export const downloadDocument = h(async (req, res) => {
  const doc = await PromoterDocument.findOne({ _id: req.params.docId, promoterId: req.params.id });
  if (!doc) throw new HttpError(404, 'Document not found');
  await audit(req, { action: 'document.download', entity: 'Document', entityId: doc._id, after: { promoterId: doc.promoterId, type: doc.type } }, { strict: true });
  const chunks = [];
  await new Promise((resolve, reject) => {
    const s = bucket().openDownloadStream(doc.gridFsId);
    s.on('data', (c) => chunks.push(c));
    s.on('error', reject);
    s.on('end', resolve);
  });
  const plain = decryptBuffer(Buffer.concat(chunks));
  res.set({
    'Content-Type': doc.mime,
    'Content-Disposition': `attachment; filename="${doc.filename.replace(/"/g, '')}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  }).send(plain);
});

/* ─────────────────────────── commission rates ─────────────────────────── */

async function rateRows(promoterId) {
  return CommissionRate.find({ $or: [{ promoterId: { $exists: false } }, ...(promoterId ? [{ promoterId }] : [])] }).lean();
}

// Highest commission (bps) that would apply to a code scoped to `scope` for this promoter.
async function maxCommissionBps(promoterId, scope, at = new Date()) {
  const rows = await rateRows(promoterId);
  const cats = scope?.length ? scope : COMMISSION_CATEGORIES;
  let max = 0;
  for (const c of cats) max = Math.max(max, pickRate(rows, { category: c, promoterId, at })?.rateBps || 0);
  return max;
}

export const createRate = h(async (req, res) => {
  const b = req.body || {};
  const rateBps = Number(b.rateBps);
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) throw bad('rateBps must be a whole number between 0 and 10000');
  if (b.category && !COMMISSION_CATEGORIES.includes(b.category)) throw bad(`category must be one of ${COMMISSION_CATEGORIES.join(', ')}`);
  if (b.promoterId) {
    if (!isId(b.promoterId) || !(await Promoter.exists({ _id: b.promoterId }))) throw bad('Promoter not found');
  }
  const effectiveFrom = b.effectiveFrom ? new Date(b.effectiveFrom) : new Date();
  if (Number.isNaN(effectiveFrom.getTime())) throw bad('effectiveFrom is invalid');

  // Margin guard against the highest active percent discount this rate could be paired with.
  const s = await getSettings();
  const topCode = await ReferralCode.findOne({ status: 'active', discountType: 'percent', ...(b.promoterId ? { promoterId: b.promoterId } : {}) })
    .sort({ discountValue: -1 }).select('discountValue code').lean();
  const guard = marginCheck({ discountBps: topCode?.discountValue || 0, commissionBps: rateBps, maxPct: s.margin_guard_max_pct, mode: s.margin_guard_mode });
  if (!guard.ok) throw new HttpError(422, `Blocked by margin guard: discount ${(topCode?.discountValue || 0) / 100}% + commission ${rateBps / 100}% = ${guard.totalPct}% (limit ${guard.maxPct}%)`, { guard });

  const doc = await CommissionRate.create({
    category: b.category || undefined, promoterId: b.promoterId || undefined,
    rateBps, effectiveFrom, note: b.note ? String(b.note).slice(0, 300) : undefined, createdBy: req.adminUser._id
  });
  await audit(req, { action: 'rate.create', entity: 'CommissionRate', entityId: doc._id, after: doc.toObject() });
  res.status(201).json({ success: true, data: doc, warnings: guard.level === 'warn' ? [`Discount + commission is ${guard.totalPct}%, above the ${guard.maxPct}% guard`] : [] });
});

export const listRates = h(async (req, res) => {
  const f = {};
  if (req.query.promoterId && isId(req.query.promoterId)) f.promoterId = req.query.promoterId;
  if (req.query.category) f.category = String(req.query.category);
  const rows = await CommissionRate.find(f).sort({ effectiveFrom: -1, createdAt: -1 }).limit(500).lean();
  res.json({ success: true, data: rows });
});

export const effectiveRate = h(async (req, res) => {
  const { category, promoterId, at } = req.query;
  const when = at ? new Date(String(at)) : new Date();
  if (Number.isNaN(when.getTime())) throw bad('at is invalid');
  const pid = promoterId && isId(promoterId) ? String(promoterId) : null;
  const hit = pickRate(await rateRows(pid), { category: category || null, promoterId: pid, at: when });
  res.json({ success: true, data: hit ? { rateBps: hit.rateBps, rateId: hit.source._id, effectiveFrom: hit.source.effectiveFrom, scope: hit.source.promoterId ? 'promoter' : 'default' } : null });
});

/* ─────────────────────────── referral codes ─────────────────────────── */

function codeFields(b, { partial } = {}) {
  const set = {};
  if (!partial || b.discountType !== undefined) {
    if (!['percent', 'flat'].includes(b.discountType)) throw bad('discountType must be percent or flat');
    set.discountType = b.discountType;
  }
  if (!partial || b.discountValue !== undefined) {
    const v = Number(b.discountValue);
    if (!Number.isInteger(v) || v < 1) throw bad('discountValue must be a positive whole number (basis points for percent, paise for flat)');
    set.discountValue = v;
  }
  const type = set.discountType || b._type;
  if (set.discountValue !== undefined && type === 'percent' && set.discountValue > 10000) throw bad('A percent discount cannot exceed 100%');
  for (const k of ['discountCapPaise', 'minOrderPaise']) {
    if (b[k] !== undefined && b[k] !== null && b[k] !== '') {
      const n = Number(b[k]);
      if (!Number.isInteger(n) || n < 0) throw bad(`${k} must be a non-negative whole number of paise`);
      set[k] = n;
    }
  }
  for (const k of ['usageLimitTotal', 'usageLimitPerCustomer']) {
    if (b[k] !== undefined && b[k] !== null && b[k] !== '') {
      const n = Number(b[k]);
      if (!Number.isInteger(n) || n < 0) throw bad(`${k} must be a non-negative whole number`);
      set[k] = n;
    }
  }
  for (const k of ['validFrom', 'validTo']) {
    if (b[k]) {
      const d = new Date(b[k]);
      if (Number.isNaN(d.getTime())) throw bad(`${k} is invalid`);
      set[k] = d;
    }
  }
  if (set.validFrom && set.validTo && set.validTo <= set.validFrom) throw bad('validTo must be after validFrom');
  if (Array.isArray(b.categoryScope)) {
    if (b.categoryScope.some((c) => !COMMISSION_CATEGORIES.includes(c))) throw bad('categoryScope has an unknown category');
    set.categoryScope = [...new Set(b.categoryScope)];
  }
  if (b.excludeSaleItems !== undefined) set.excludeSaleItems = !!b.excludeSaleItems;
  if (b.combinable !== undefined) set.combinable = !!b.combinable;
  return set;
}

async function guardForCode(promoterId, set, scope) {
  if (set.discountType !== 'percent') return { ok: true, level: 'ok' };
  const s = await getSettings();
  const commissionBps = await maxCommissionBps(String(promoterId), scope);
  return marginCheck({ discountBps: set.discountValue, commissionBps, maxPct: s.margin_guard_max_pct, mode: s.margin_guard_mode });
}

const randomCode = (prefix, len) => {
  const bytes = crypto.randomBytes(len);
  let s = prefix;
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
};

export const createCode = h(async (req, res) => {
  const b = req.body || {};
  if (!b.promoterId || !isId(b.promoterId)) throw bad('promoterId is required');
  const promoter = await Promoter.findById(b.promoterId).select('status');
  if (!promoter) throw bad('Promoter not found');
  if (promoter.status === 'terminated') throw bad('Cannot create a code for a terminated promoter');
  const code = b.code ? normalizeCode(b.code) : randomCode('', 8);
  if (!isValidCode(code)) throw bad('Code must be 4-20 characters from A-Z (no I, L, O) and 2-9');
  const set = codeFields(b);
  const guard = await guardForCode(b.promoterId, set, set.categoryScope);
  if (!guard.ok) throw new HttpError(422, `Blocked by margin guard: total ${guard.totalPct}% exceeds ${guard.maxPct}%`, { guard });
  const doc = await ReferralCode.create({ ...set, code, promoterId: b.promoterId, createdBy: req.adminUser._id });
  await audit(req, { action: 'code.create', entity: 'ReferralCode', entityId: doc._id, after: doc.toObject() });
  res.status(201).json({ success: true, data: doc, warnings: guard.level === 'warn' ? [`Discount + commission is ${guard.totalPct}%, above the ${guard.maxPct}% guard`] : [] });
});

export const bulkCreateCodes = h(async (req, res) => {
  const b = req.body || {};
  if (!b.promoterId || !isId(b.promoterId)) throw bad('promoterId is required');
  const count = Number(b.count);
  if (!Number.isInteger(count) || count < 1 || count > 200) throw bad('count must be between 1 and 200');
  const prefix = normalizeCode(b.prefix || '');
  if (!/^[A-HJKMNP-Z2-9]{0,8}$/.test(prefix)) throw bad('prefix may use A-Z (no I, L, O) and 2-9, up to 8 characters');
  const promoter = await Promoter.findById(b.promoterId).select('status');
  if (!promoter || promoter.status === 'terminated') throw bad('Promoter not found or terminated');
  const set = codeFields(b);
  const guard = await guardForCode(b.promoterId, set, set.categoryScope);
  if (!guard.ok) throw new HttpError(422, `Blocked by margin guard: total ${guard.totalPct}% exceeds ${guard.maxPct}%`, { guard });

  const created = [];
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const doc = await ReferralCode.create({ ...set, code: randomCode(prefix, 8), promoterId: b.promoterId, createdBy: req.adminUser._id });
        created.push(doc.code);
        break;
      } catch (e) { if (e?.code !== 11000 || attempt === 4) throw e; }
    }
  }
  await audit(req, { action: 'code.bulk_create', entity: 'ReferralCode', entityId: b.promoterId, after: { count: created.length, prefix } });
  res.status(201).json({ success: true, data: { codes: created } });
});

export const listCodes = h(async (req, res) => {
  const { page: pg, limit, skip } = page(req.query);
  const f = {};
  if (req.query.promoterId && isId(req.query.promoterId)) f.promoterId = req.query.promoterId;
  if (req.query.status) f.status = String(req.query.status);
  if (req.query.q) f.code = new RegExp(escapeRegex(normalizeCode(req.query.q).slice(0, 20)), 'i');
  const [rows, total] = await Promise.all([
    ReferralCode.find(f).populate('promoterId', 'name status').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ReferralCode.countDocuments(f)
  ]);
  res.json({ success: true, data: rows, total, page: pg, limit });
});

export const updateCode = h(async (req, res) => {
  const c = await ReferralCode.findById(req.params.id);
  if (!c) throw new HttpError(404, 'Code not found');
  const before = c.toObject();
  const set = codeFields({ ...req.body, _type: c.discountType }, { partial: true });
  Object.assign(c, set);
  if (c.discountType === 'percent' && c.discountValue > 10000) throw bad('A percent discount cannot exceed 100%');
  const guard = await guardForCode(c.promoterId, { discountType: c.discountType, discountValue: c.discountValue }, c.categoryScope);
  if (!guard.ok) throw new HttpError(422, `Blocked by margin guard: total ${guard.totalPct}% exceeds ${guard.maxPct}%`, { guard });
  await c.save();
  await audit(req, { action: 'code.update', entity: 'ReferralCode', entityId: c._id, before, after: c.toObject() });
  res.json({ success: true, data: c, warnings: guard.level === 'warn' ? [`Discount + commission is ${guard.totalPct}%, above the ${guard.maxPct}% guard`] : [] });
});

const codeStatusAction = (action, to, from) => h(async (req, res) => {
  const c = await ReferralCode.findById(req.params.id);
  if (!c) throw new HttpError(404, 'Code not found');
  if (from && !from.includes(c.status)) throw new HttpError(409, `Code is ${c.status}; cannot ${action}`);
  if (action === 'resume') {
    const p = await Promoter.findById(c.promoterId).select('status');
    if (p?.status !== 'active') throw new HttpError(409, 'The promoter is not active');
    if (c.validTo && c.validTo < new Date()) throw new HttpError(409, 'The code has passed its end date');
  }
  const before = c.toObject();
  c.status = to;
  c.pausedReason = action === 'pause' ? 'manual' : undefined;
  await c.save();
  await audit(req, { action: `code.${action}`, entity: 'ReferralCode', entityId: c._id, before, after: c.toObject(), reason: req.body?.reason });
  res.json({ success: true, data: c });
});
export const pauseCode = codeStatusAction('pause', 'paused', ['active']);
export const resumeCode = codeStatusAction('resume', 'active', ['paused']);
export const expireCode = codeStatusAction('expire', 'expired', ['active', 'paused']);

/* ─────────────────────────── settings & audit ─────────────────────────── */

export const getAllSettings = h(async (_req, res) => {
  res.json({ success: true, data: { settings: await getSettings({ fresh: true }), defaults: Object.fromEntries(Object.entries(SETTING_DEFS).map(([k, d]) => [k, d.def])) } });
});

export const updateSettings = h(async (req, res) => {
  const v = validateSettingsUpdate(req.body);
  if (!v.ok) throw bad(v.errors[0], { errors: v.errors });
  const current = await getSettings({ fresh: true });
  const changed = Object.keys(v.clean).filter((k) => JSON.stringify(current[k]) !== JSON.stringify(v.clean[k]));
  for (const k of changed) {
    await ReferralSetting.create({ key: k, value: v.clean[k], setBy: req.adminUser._id });
    await audit(req, { action: 'setting.update', entity: 'Setting', entityId: k, before: current[k], after: v.clean[k] });
  }
  clearSettingsCache();
  res.json({ success: true, data: { settings: await getSettings({ fresh: true }), changed } });
});

export const listAudit = h(async (req, res) => {
  const { page: pg, limit, skip } = page(req.query);
  const f = {};
  if (req.query.entity) f.entity = String(req.query.entity);
  if (req.query.action) f.action = new RegExp(`^${escapeRegex(String(req.query.action).slice(0, 40))}`);
  if (req.query.entityId) f.entityId = String(req.query.entityId);
  if (req.query.from || req.query.to) {
    f.createdAt = {};
    if (req.query.from) f.createdAt.$gte = new Date(String(req.query.from));
    if (req.query.to) f.createdAt.$lte = new Date(String(req.query.to));
  }
  const [rows, total] = await Promise.all([
    ReferralAuditLog.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ReferralAuditLog.countDocuments(f)
  ]);
  res.json({ success: true, data: rows, total, page: pg, limit });
});

/* ─────────────────────────── referred orders & ledger (Phase 2) ─────────────────────────── */

const maskName = (n) => String(n || '').split(/\s+/).filter(Boolean).map((w) => `${w[0]}***`).join(' ');
const maskPhone = (p) => (p ? `******${String(p).slice(-4)}` : '');

export const listReferredOrders = h(async (req, res) => {
  const { page: pg, limit, skip } = page(req.query);
  const f = {};
  if (req.query.promoterId && isId(req.query.promoterId)) f.promoterId = req.query.promoterId;
  if (req.query.code) f.codeText = normalizeCode(req.query.code);
  if (req.query.status) f.status = String(req.query.status);
  if (req.query.from || req.query.to) {
    f.createdAt = {};
    if (req.query.from) f.createdAt.$gte = new Date(String(req.query.from));
    if (req.query.to) f.createdAt.$lte = new Date(String(req.query.to));
  }
  const [refs, total] = await Promise.all([
    OrderReferral.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('promoterId', 'name').lean(),
    OrderReferral.countDocuments(f)
  ]);
  const orders = await Order.find({ _id: { $in: refs.map((r) => r.orderId) } })
    .select('orderNumber status createdAt billing customer').lean();
  const byId = new Map(orders.map((o) => [String(o._id), o]));
  const rows = refs.map((r) => {
    const o = byId.get(String(r.orderId)) || {};
    return {
      _id: r._id, orderNumber: r.orderNumber, orderDate: o.createdAt || r.createdAt, orderStatus: o.status,
      promoter: r.promoterId?.name, code: r.codeText,
      customer: `${maskName(o.customer?.name)} ${maskPhone(o.customer?.phone)}`.trim(),   // masked: promoters never see this, admins see a masked form
      grossPaise: Math.round((o.billing?.subtotal || 0) * 100),
      discountPaise: r.discountTotalPaise,
      taxablePaise: Math.round((o.billing?.taxableAmount || 0) * 100),
      gstPaise: Math.round(((o.billing?.cgst || 0) + (o.billing?.sgst || 0) + (o.billing?.igst || 0)) * 100),
      shippingPaise: Math.round((o.billing?.shippingCharge || 0) * 100),
      commissionPaise: r.commissionTotalPaise, referralStatus: r.status, flags: r.flags
    };
  });
  res.json({ success: true, data: rows, total, page: pg, limit });
});

export const listLedger = h(async (req, res) => {
  const { page: pg, limit, skip } = page(req.query);
  const f = {};
  if (req.query.promoterId && isId(req.query.promoterId)) f.promoterId = req.query.promoterId;
  if (req.query.orderId && isId(req.query.orderId)) f.orderId = req.query.orderId;
  if (req.query.type) f.entryType = String(req.query.type);
  const [rows, total] = await Promise.all([
    CommissionLedger.find(f).sort({ eventAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    CommissionLedger.countDocuments(f)
  ]);
  res.json({ success: true, data: rows, total, page: pg, limit });
});

// SUM(ledger) per promoter and bucket: the single source of truth for what is owed.
export const ledgerBalances = h(async (_req, res) => {
  const rows = await CommissionLedger.aggregate([
    { $group: { _id: { promoterId: '$promoterId', bucket: '$bucket' }, amountPaise: { $sum: '$amountPaise' } } }
  ]);
  const by = {};
  for (const r of rows) {
    const k = String(r._id.promoterId);
    by[k] = by[k] || { promoterId: k, pendingPaise: 0, payablePaise: 0 };
    by[k][r._id.bucket === 'pending' ? 'pendingPaise' : 'payablePaise'] += r.amountPaise;
  }
  const promoters = await Promoter.find({ _id: { $in: Object.keys(by) } }).select('name').lean();
  const names = new Map(promoters.map((p) => [String(p._id), p.name]));
  res.json({ success: true, data: Object.values(by).map((b) => ({ ...b, name: names.get(b.promoterId) })) });
});

// Manual correction: a NEW ledger row (never an edit), super_admin only, reason mandatory.
export const adjustLedger = h(async (req, res) => {
  const b = req.body || {};
  const amount = Number(b.amountPaise);
  const reason = String(b.reason || '').trim();
  if (!b.promoterId || !isId(b.promoterId) || !(await Promoter.exists({ _id: b.promoterId }))) throw bad('Promoter not found');
  if (!Number.isInteger(amount) || amount === 0) throw bad('amountPaise must be a non-zero whole number (negative to deduct)');
  if (Math.abs(amount) > 100000000) throw bad('Amount is unreasonably large');
  if (reason.length < 5) throw bad('A reason of at least 5 characters is required');
  const bucket = b.bucket === 'pending' ? 'pending' : 'payable';
  const entry = await CommissionLedger.create({
    promoterId: b.promoterId, entryType: 'adjustment', bucket, amountPaise: amount, reason: reason.slice(0, 300),
    eventAt: new Date(), actor: String(req.adminUser._id), idempotencyKey: `adj:${crypto.randomUUID()}`
  });
  await audit(req, { action: 'ledger.adjust', entity: 'Ledger', entityId: entry._id, after: { promoterId: b.promoterId, amountPaise: amount, bucket }, reason });
  res.status(201).json({ success: true, data: entry });
});
