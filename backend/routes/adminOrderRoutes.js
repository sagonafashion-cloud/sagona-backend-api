import express from 'express';
import { getOrders, createManualOrder, updateOrder, adminInitiateReturn, getPendingReturns, actionReturn } from '../controllers/orderController.js';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';

const router = express.Router();

router.get('/',         adminProtect, requireRole('super_admin', 'finance_manager', 'store_manager', 'viewer'), getOrders);
router.post('/manual',  adminProtect, requireRole('super_admin', 'store_manager'), createManualOrder);
router.put('/:id/status', adminProtect, requireRole('super_admin', 'store_manager'), updateOrder);
router.post('/:id/return', adminProtect, requireRole('super_admin', 'store_manager'), adminInitiateReturn);

// Return request management
router.get('/returns',              adminProtect, requireRole('super_admin', 'store_manager', 'viewer'), getPendingReturns);
router.put('/:id/return-action',    adminProtect, requireRole('super_admin', 'store_manager'), actionReturn);

export default router;
