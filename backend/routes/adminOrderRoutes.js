import express from 'express';
import { getOrders, createManualOrder, updateOrderStatus, adminInitiateReturn, getPendingReturns, actionReturn, getHeldReturns, decideReturnStock } from '../controllers/orderController.js';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';
import { validate, mongoIdParam } from '../middleware/validate.js';

const router = express.Router();

router.get('/',         adminProtect, requireRole('super_admin', 'finance_manager', 'store_manager', 'viewer'), getOrders);
router.post('/manual',  adminProtect, requireRole('super_admin', 'store_manager'), createManualOrder);
router.put('/:id/status', adminProtect, requireRole('super_admin', 'store_manager'), mongoIdParam('id'), validate, updateOrderStatus);
router.post('/:id/return', adminProtect, requireRole('super_admin', 'store_manager'), mongoIdParam('id'), validate, adminInitiateReturn);

// Return request management
router.get('/returns',              adminProtect, requireRole('super_admin', 'store_manager', 'viewer'), getPendingReturns);
router.get('/held-returns',         adminProtect, requireRole('super_admin', 'store_manager', 'viewer'), getHeldReturns);
router.post('/:id/return-stock',    adminProtect, requireRole('super_admin', 'store_manager'), mongoIdParam('id'), validate, decideReturnStock);
router.put('/:id/return-action',   adminProtect, requireRole('super_admin', 'store_manager'), mongoIdParam('id'), validate, actionReturn);

export default router;
