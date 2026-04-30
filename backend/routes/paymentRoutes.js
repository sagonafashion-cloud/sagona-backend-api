import express from 'express';
import { createRazorpayOrder, getKey } from '../controllers/paymentController.js';

const router = express.Router();

router.post('/create-order', createOrder);
router.get('/key', getKey);

export default router;