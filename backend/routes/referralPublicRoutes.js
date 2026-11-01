import express from 'express';
import rateLimit from 'express-rate-limit';
import { isProgrammeEnabled } from '../services/referral/settings.js';
import { validateReferral } from '../controllers/referralPublicController.js';

// Code-guessing protection: tight per-IP budget on top of the global /api limiter.
const validateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' }
});

// Mounted at /api/referral ONLY when REFERRAL_ENABLED=true. When the env flag is
// off this file is never loaded, so the URL simply 404s and the storefront keeps
// the referral field hidden.
const router = express.Router();

// Lets the storefront decide whether to show the "Have a referral code?" field.
// Reveals nothing else (no codes, no promoter data).
router.get('/status', async (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ success: true, data: { enabled: await isProgrammeEnabled() } });
});

// Server-side only: the browser never decides an amount.
router.post('/validate', validateLimiter, validateReferral);

export default router;
