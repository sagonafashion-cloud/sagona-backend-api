import express from 'express';
import { createOrder, getKey } from '../controllers/payment.controller.js';

const router = express.Router();

router.post('/create-order', createOrder);
router.get('/key', getKey);

export default router;