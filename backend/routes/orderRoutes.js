import express from 'express';
import { createOrder, getOrders, getMyOrders, getOrderById, updateOrder, cancelOrder, initiateReturn, getOrderTracking } from '../controllers/orderController.js';
import { protect, admin, optionalAuth } from '../middleware/auth.js';
import { validate, createOrderRules } from '../middleware/validate.js';
import { orderCreateLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/',                   protect,        orderCreateLimiter, createOrderRules, validate, createOrder);
router.get('/my',                  protect,        getMyOrders);
router.get('/:id/tracking',        optionalAuth,   getOrderTracking);
router.get('/:id',                 protect,        getOrderById);
router.get('/',                    protect, admin, getOrders);
router.put('/:id',                 protect, admin, updateOrder);
router.post('/:id/cancel',         protect,        cancelOrder);
router.post('/:id/return-request', protect,        initiateReturn);

export default router;