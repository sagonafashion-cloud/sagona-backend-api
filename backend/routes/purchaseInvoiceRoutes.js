import express from 'express';
import multer from 'multer';
import {
  listPurchaseInvoices,
  getPurchaseInvoiceById,
  createPurchaseInvoice,
  updatePurchaseInvoice,
  cancelPurchaseInvoice,
  extractPurchaseInvoice
} from '../controllers/purchaseInvoiceController.js';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';
import { validate, mongoIdParam, createPurchaseInvoiceRules } from '../middleware/validate.js';
import { uploadLimiter } from '../middleware/rateLimiters.js';
import { verifyFileSignature } from '../utils/fileValidation.js';

const router = express.Router();

const extractUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase().split('.').pop();
    ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)
      ? cb(null, true)
      : cb(new Error('Upload a PDF, JPG, PNG or WebP'));
  }
});

// Vendor purchase invoices are financial/GST records — every route here is
// super_admin only (no content_editor/finance_manager exception), per the
// spec's explicit "super_admin-only CRUD" requirement.
router.use(adminProtect, requireRole('super_admin'));

// AI read of an uploaded vendor invoice → unsaved draft. Rate-limited (each
// call costs a few rupees of API usage) and signature-checked before the
// bytes are sent anywhere. Registered before '/:id' routes.
router.post(
  '/extract',
  uploadLimiter,
  extractUpload.single('file'),
  verifyFileSignature(['pdf', 'jpeg', 'png', 'webp'], { field: 'invoice' }),
  extractPurchaseInvoice
);

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
