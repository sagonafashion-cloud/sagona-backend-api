import express from 'express';
import { createRazorpayOrder, getRazorpayKey, verifyPayment } from '../controllers/paymentController.js';
import { protect } from '../middleware/auth.js';
import { paymentLimiter } from '../middleware/rateLimiters.js';
import { validate, createOrderRules, verifyPaymentRules } from '../middleware/validate.js';

const router = express.Router();

router.post('/create-order', protect, paymentLimiter, createOrderRules, validate, createRazorpayOrder);
router.get('/key', getRazorpayKey);
router.post('/verify', protect, paymentLimiter, verifyPaymentRules, validate, verifyPayment);
// Webhook is registered in server.js with express.raw() before express.json() — do not add it here

export default router;
