import express from 'express';
import { isProgrammeEnabled } from '../services/referral/settings.js';

// Mounted at /api/referral ONLY when REFERRAL_ENABLED=true. When the env flag is
// off this file is never loaded, so the URL simply 404s and the storefront keeps
// the referral field hidden.
const router = express.Router();

// Lets the storefront decide whether to show the "Have a referral code?" field.
// Reveals nothing else (no codes, no promoter data).
router.get('/status', async (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ success: true, data: { enabled: await isProgrammeEnabled() } });
});

export default router;
