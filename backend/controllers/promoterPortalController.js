import crypto from 'crypto';
import Promoter from '../models/referral/Promoter.js';
import PromoterLoginCode from '../models/referral/PromoterLoginCode.js';
import ReferralCode from '../models/referral/ReferralCode.js';
import ReferralClickDay from '../models/referral/ReferralClickDay.js';
import OrderReferral from '../models/referral/OrderReferral.js';
import CommissionLedger from '../models/referral/CommissionLedger.js';
import PayoutItem from '../models/referral/PayoutItem.js';
import Order from '../models/Order.js';
import { sendEmail } from '../utils/emailService.js';
import { hashOtp, safeEqualHex, signPromoterToken } from '../middleware/promoterAuth.js';
import { buildStatement } from '../services/referral/payout.js';

const GENERIC_LOGIN_FAIL = 'Invalid or expired code';
const SITE = () => (process.env.SITE_URL || 'https://sagona.in').replace(/\/$/, '');
const emailOk = (e) => typeof e === 'string' && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const h = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { console.error('[promoter portal]', e.message); res.status(500).json({ success: false, message: 'Something went wrong' }); } };

/* ── login (email one-time code) ── */
export const requestCode = h(async (req, res) => {
  const reply = () => res.json({ success: true, message: 'If this email belongs to an active promoter, a code has been sent.' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!emailOk(email)) return reply();                                   // identical answer: no probing
  const p = await Promoter.findOne({ email, status: 'active' }).select('name email').lean();
  if (!p) return reply();
  const recent = await PromoterLoginCode.countDocuments({ promoterId: p._id, createdAt: { $gte: new Date(Date.now() - 3600000) } });
  if (recent >= 5) return reply();
  const otp = String(crypto.randomInt(100000, 1000000));
  await PromoterLoginCode.updateMany({ promoterId: p._id, used: false }, { $set: { used: true } });
  await PromoterLoginCode.create({ promoterId: p._id, hash: hashOtp(otp), expiresAt: new Date(Date.now() + 10 * 60000) });
  // Not awaited, so response time is the same for known and unknown emails.
  sendEmail({ to: p.email, subject: 'Your SAGONA promoter login code', html: `<div style="font-family:Arial,sans-serif"><p>Hi ${String(p.name).replace(/[<>&"']/g, '')},</p><p>Your login code is <b style="font-size:20px;letter-spacing:3px">${otp}</b>. It works for 10 minutes. If you did not ask for it, ignore this email.</p></div>` })
    .catch((e) => console.error('[promoter portal] login email failed:', e.message));
  reply();
});

export const verifyCode = h(async (req, res) => {
  const fail = () => res.status(401).json({ success: false, message: GENERIC_LOGIN_FAIL });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const otp = String(req.body?.otp || '').trim();
  if (!emailOk(email) || !/^\d{6}$/.test(otp)) return fail();
  const p = await Promoter.findOne({ email, status: 'active' }).select('_id').lean();
  if (!p) return fail();
  const row = await PromoterLoginCode.findOne({ promoterId: p._id, used: false, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!row || row.attempts >= 5) return fail();
  if (!safeEqualHex(row.hash, hashOtp(otp))) { await PromoterLoginCode.updateOne({ _id: row._id }, { $inc: { attempts: 1 } }); return fail(); }
  const used = await PromoterLoginCode.updateOne({ _id: row._id, used: false }, { $set: { used: true } });   // single use, even under a race
  if (!used.modifiedCount) return fail();
  res.json({ success: true, token: signPromoterToken(p) });
});

/* ── read-only data: ALWAYS scoped to req.promoter; no id is ever taken from the request ── */
const maskMobile = (m) => (m ? `XXXXXX${String(m).slice(-4)}` : '');

export const me = h(async (req, res) => {
  const p = req.promoter;
  res.json({ success: true, data: { name: p.name, email: p.email, mobile: maskMobile(p.mobile), panLast4: p.panLast4, bankLast4: p.bankLast4, kycStatus: p.kycStatus, agreementStatus: p.agreementStatus, notifyEmail: p.notifyEmail !== false } });
});

export const setNotifications = h(async (req, res) => {
  if (typeof req.body?.notifyEmail !== 'boolean') return res.status(422).json({ success: false, message: 'notifyEmail must be true or false' });
  await Promoter.updateOne({ _id: req.promoter._id }, { $set: { notifyEmail: req.body.notifyEmail } });
  res.json({ success: true, data: { notifyEmail: req.body.notifyEmail } });
});

export const dashboard = h(async (req, res) => {
  const pid = req.promoter._id;
  const [ledger, items, orders, clicks] = await Promise.all([
    CommissionLedger.aggregate([{ $match: { promoterId: pid } }, { $group: { _id: '$bucket', amountPaise: { $sum: '$amountPaise' } } }]),
    PayoutItem.find({ promoterId: pid, status: { $in: ['approved', 'paid'] } }).select('status grossPaise netPaise').lean(),
    OrderReferral.countDocuments({ promoterId: pid, status: 'applied' }),
    ReferralClickDay.aggregate([{ $match: { promoterId: pid, day: { $gte: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) } } }, { $group: { _id: null, n: { $sum: '$clicks' } } }])
  ]);
  const b = Object.fromEntries(ledger.map((r) => [r._id, r.amountPaise]));
  res.json({ success: true, data: {
    pendingPaise: b.pending || 0, payablePaise: b.payable || 0,
    inApprovedPayoutPaise: items.filter((i) => i.status === 'approved').reduce((s, i) => s + i.grossPaise, 0),
    paidNetPaise: items.filter((i) => i.status === 'paid').reduce((s, i) => s + i.netPaise, 0),
    referredOrders: orders, clicks30d: clicks[0]?.n || 0
  } });
});

export const codes = h(async (req, res) => {
  const rows = await ReferralCode.find({ promoterId: req.promoter._id }).select('code status discountType discountValue discountCapPaise minOrderPaise validTo').lean();
  res.json({ success: true, data: rows.map((c) => ({ ...c, link: `${SITE()}/?ref=${encodeURIComponent(c.code)}` })) });
});

// Own referred orders: date, code, simple status and commission only. No customer data, no order contents.
export const orders = h(async (req, res) => {
  const refs = await OrderReferral.find({ promoterId: req.promoter._id }).sort({ createdAt: -1 }).limit(100).select('orderId codeText createdAt commissionTotalPaise status').lean();
  const st = new Map((await Order.find({ _id: { $in: refs.map((r) => r.orderId) } }).select('status').lean()).map((o) => [String(o._id), o.status]));
  const simple = (s) => (s === 'delivered' ? 'Delivered' : ['cancelled', 'returned'].includes(s) ? 'Cancelled / returned' : 'In progress');
  res.json({ success: true, data: refs.map((r) => ({ date: r.createdAt, code: r.codeText, status: r.status === 'void' ? 'Cancelled / returned' : simple(st.get(String(r.orderId))), commissionPaise: r.commissionTotalPaise })) });
});

export const payouts = h(async (req, res) => {
  const rows = await PayoutItem.find({ promoterId: req.promoter._id, status: { $in: ['approved', 'paid'] } }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: rows.map((i) => ({ voucherNo: i.voucherNo, date: i.paidAt || i.createdAt, status: i.status === 'paid' ? 'Paid' : 'Being processed', grossPaise: i.grossPaise, gstPaise: i.gstPaise, tdsPaise: i.tdsPaise, netPaise: i.netPaise, utr: i.status === 'paid' ? i.utr : undefined })) });
});

export const statement = h(async (req, res) => {
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 30 * 86400000);
  if (isNaN(from) || isNaN(to) || from >= to) return res.status(422).json({ success: false, message: 'Invalid date range' });
  const rows = await CommissionLedger.find({ promoterId: req.promoter._id, eventAt: { $lt: to } }).select('eventAt entryType bucket amountPaise').lean();
  res.json({ success: true, data: { from, to, summary: buildStatement(rows, from, to) } });
});
