import express from 'express';
import { createOrder, getOrders, getMyOrders, getOrderById, updateOrder, cancelOrder, initiateReturn, getOrderTracking } from '../controllers/orderController.js';
import { protect, admin, optionalAuth, guestOrAuth } from '../middleware/auth.js';
import { validate, createOrderRules } from '../middleware/validate.js';
import { orderCreateLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

// Guest checkout: no token → guest (createOrder collects contact + auto-creates
// an account); valid token → logged-in (unchanged); stale token → clean 401.
router.post('/',                   guestOrAuth,    orderCreateLimiter, createOrderRules, validate, createOrder);
router.get('/my',                  protect,        getMyOrders);
router.get('/:id/tracking',        optionalAuth,   getOrderTracking);
router.get('/:id',                 protect,        getOrderById);
router.get('/',                    protect, admin, getOrders);
router.put('/:id',                 protect, admin, updateOrder);
router.post('/:id/cancel',         protect,        cancelOrder);
router.post('/:id/return-request', protect,        initiateReturn);

export default router;