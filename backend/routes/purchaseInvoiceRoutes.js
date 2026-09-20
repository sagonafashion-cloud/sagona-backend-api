import express from 'express';
import {
  listPurchaseInvoices,
  getPurchaseInvoiceById,
  createPurchaseInvoice,
  updatePurchaseInvoice,
  cancelPurchaseInvoice
} from '../controllers/purchaseInvoiceController.js';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';
import { validate, mongoIdParam, createPurchaseInvoiceRules } from '../middleware/validate.js';

const router = express.Router();

// Vendor purchase invoices are financial/GST records — every route here is
// super_admin only (no content_editor/finance_manager exception), per the
// spec's explicit "super_admin-only CRUD" requirement.
router.use(adminProtect, requireRole('super_admin'));

router.get('/', listPurchaseInvoices);
router.get('/:id', mongoIdParam('id'), validate, getPurchaseInvoiceById);
router.post('/', createPurchaseInvoiceRules, validate, createPurchaseInvoice);
// Partial updates are allowed (see updatePurchaseInvoice's field-by-field
// merge), so the create rules — which require every field — are not reused
// here; the controller itself validates taxType/items shape when those
// fields are actually part of the update.
router.put('/:id', mongoIdParam('id'), validate, updatePurchaseInvoice);
router.patch('/:id/cancel', mongoIdParam('id'), validate, cancelPurchaseInvoice);

export default router;
