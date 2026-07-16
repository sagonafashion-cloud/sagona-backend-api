import express from 'express';
import { createRazorpayOrder, getRazorpayKey, verifyPayment } from '../controllers/paymentController.js';
import { guestOrAuth } from '../middleware/auth.js';
import { paymentLimiter } from '../middleware/rateLimiters.js';
import { validate, createOrderRules, verifyPaymentRules } from '../middleware/validate.js';

const router = express.Router();

// guestOrAuth: guests may pay online (no token → guest; stale token → 401).
// Amount is still recomputed server-side and the signature is still verified —
// guest access changes nothing about the payment-integrity checks.
router.post('/create-order', guestOrAuth, paymentLimiter, createOrderRules, validate, createRazorpayOrder);
router.get('/key', getRazorpayKey);
router.post('/verify', guestOrAuth, paymentLimiter, verifyPaymentRules, validate, verifyPayment);
// Webhook is registered in server.js with express.raw() before express.json() — do not add it here

export default router;
