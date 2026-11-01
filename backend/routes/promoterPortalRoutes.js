import express from 'express';
import rateLimit from 'express-rate-limit';
import { portalEnabled, promoterProtect } from '../middleware/promoterAuth.js';
import * as c from '../controllers/promoterPortalController.js';

// Mounted at /api/promoter ONLY when REFERRAL_ENABLED=true; additionally 404s until the
// `portal_enabled` setting is switched on. Read-only apart from the email preference.
const lim = (max) => rateLimit({ windowMs: 15 * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many attempts. Please try again later.' } });

const router = express.Router();
router.use(portalEnabled);
router.post('/auth/request', lim(5), c.requestCode);
router.post('/auth/verify', lim(10), c.verifyCode);

router.use(lim(120), promoterProtect);
router.get('/me', c.me);
router.put('/me/notifications', c.setNotifications);
router.get('/dashboard', c.dashboard);
router.get('/codes', c.codes);
router.get('/orders', c.orders);
router.get('/payouts', c.payouts);
router.get('/statement', c.statement);

export default router;
