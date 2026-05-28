import express from 'express';
import { createOrder, getOrders, getMyOrders, getOrderById, updateOrder, cancelOrder, createReturnRequest } from '../controllers/orderController.js';
import { protect, admin } from '../middleware/auth.js';
import { validate, createOrderRules } from '../middleware/validate.js';

const router = express.Router();

router.post('/',               protect,        createOrderRules, validate, createOrder);
router.get('/my',              protect,        getMyOrders);
router.get('/:id',             protect,        getOrderById);
router.get('/',                protect, admin, getOrders);
router.put('/:id',             protect, admin, updateOrder);
router.post('/:id/cancel',     protect,        cancelOrder);
router.post('/:id/return-request', protect,    createReturnRequest);

export default router;