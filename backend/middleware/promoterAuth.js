import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Promoter from '../models/referral/Promoter.js';
import { isProgrammeEnabled, getSettings } from '../services/referral/settings.js';

// Promoter portal sessions use their own signing key (derived from JWT_SECRET) and audience,
// so a customer or admin token can never be accepted here, nor a promoter token anywhere else.
const key = () => crypto.createHmac('sha256', process.env.JWT_SECRET || '').update('promoter-portal-v1').digest('hex');
export const signPromoterToken = (promoter) =>
  jwt.sign({ sub: String(promoter._id), type: 'promoter' }, key(), { algorithm: 'HS256', audience: 'promoter-portal', expiresIn: '12h' });

export const hashOtp = (otp) => crypto.createHmac('sha256', key()).update(`otp:${otp}`).digest('hex');
export const safeEqualHex = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** 404 unless the programme AND the portal setting are on. */
export const portalEnabled = async (_req, res, next) => {
  try {
    if (!(await isProgrammeEnabled()) || !(await getSettings()).portal_enabled) return res.status(404).json({ success: false, message: 'Not found' });
    next();
  } catch { res.status(404).json({ success: false, message: 'Not found' }); }
};

export const promoterProtect = async (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Please log in' });
  try {
    const d = jwt.verify(token, key(), { algorithms: ['HS256'], audience: 'promoter-portal' });
    if (d.type !== 'promoter') throw new Error('type');
    const p = await Promoter.findById(d.sub).select('name email mobile status notifyEmail panLast4 bankLast4 kycStatus agreementStatus');
    if (!p || p.status !== 'active') return res.status(401).json({ success: false, message: 'Please log in' });
    req.promoter = p;
    next();
  } catch { res.status(401).json({ success: false, message: 'Please log in' }); }
};
