import express from 'express';
import {
  adminCreateProduct,
  adminUpdateProduct,
  adminArchiveProduct,
  adminBulkImport,
  adminUpdateInventory
} from '../controllers/productController.js';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';
import { validate, createProductRules } from '../middleware/validate.js';

const router = express.Router();

const canEdit = requireRole('super_admin', 'content_editor');

router.post('/bulk', adminProtect, requireRole('super_admin', 'content_editor'), adminBulkImport);
router.post('/', adminProtect, canEdit, createProductRules, validate, adminCreateProduct);
router.put('/:id/inventory', adminProtect, requireRole('super_admin', 'store_manager', 'content_editor'), adminUpdateInventory);
router.put('/:id', adminProtect, canEdit, adminUpdateProduct);
router.delete('/:id', adminProtect, requireRole('super_admin'), adminArchiveProduct);

export default router;
