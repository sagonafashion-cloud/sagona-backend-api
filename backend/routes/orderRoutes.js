import express from 'express';
import { createOrder, getOrders, getMyOrders, getOrderById, cancelOrder, initiateReturn, getOrderTracking } from '../controllers/orderController.js';
import { protect, admin, guestOrAuth } from '../middleware/auth.js';
import { validate, createOrderRules } from '../middleware/validate.js';
import { orderCreateLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

// Guest checkout: no token → guest (createOrder collects contact + auto-creates
// an account); valid token → logged-in (unchanged); stale token → clean 401.
router.post('/',                   guestOrAuth,    orderCreateLimiter, createOrderRules, validate, createOrder);
router.get('/my',                  protect,        getMyOrders);
router.get('/:id/tracking',        protect,        getOrderTracking);
router.get('/:id',                 protect,        getOrderById);
router.get('/',                    protect, admin, getOrders);
// Order status updates go through /api/admin/orders/:id/status (adminOrderRoutes.js,
// updateOrderStatus) — this is the only status-transition path admin.js calls, and
// the one with full timeline/shipment-tracking support. A second, unused, more
// limited status-update path used to live here — removed rather than left to drift.
router.post('/:id/cancel',         protect,        cancelOrder);
router.post('/:id/return-request', protect,        initiateReturn);

export default router;
