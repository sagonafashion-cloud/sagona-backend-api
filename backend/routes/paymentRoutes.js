import express from 'express';
import { createRazorpayOrder, getRazorpayKey, verifyPayment } from '../controllers/paymentController.js';

const router = express.Router();

router.post('/create-order', createRazorpayOrder);
router.get('/key', getRazorpayKey);
router.post('/verify', verifyPayment);
// Webhook is registered in server.js with express.raw() before express.json() — do not add it here

export default router;
