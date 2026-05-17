import express from 'express';
import {
  getRevenue,
  getOrderAnalytics,
  getTopProducts,
  getCustomerMetrics,
  getInventoryAlerts,
  getGstSummary
} from '../controllers/analyticsController.js';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';

const router = express.Router();

const canView = requireRole('super_admin', 'finance_manager', 'store_manager', 'viewer');

router.use(adminProtect);

router.get('/revenue',          canView, getRevenue);
router.get('/orders',           canView, getOrderAnalytics);
router.get('/products/top',     canView, getTopProducts);
router.get('/customers',        requireRole('super_admin', 'finance_manager'), getCustomerMetrics);
router.get('/inventory/alerts', canView, getInventoryAlerts);
router.get('/gst',              requireRole('super_admin', 'finance_manager'), getGstSummary);

export default router;
