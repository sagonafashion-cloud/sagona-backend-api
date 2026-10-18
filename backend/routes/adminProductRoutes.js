import express from 'express';
import multer from 'multer';
import {
  adminCreateProduct,
  adminUpdateProduct,
  adminArchiveProduct,
  adminBulkImport,
  adminUpdateInventory,
  adminGetProductCostPrice,
  adminListProducts,
  adminGetProduct
} from '../controllers/productController.js';
import { parseProductFile, bulkUploadProducts } from '../controllers/bulkUploadController.js';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';
import { validate, createProductRules, mongoIdParam } from '../middleware/validate.js';
import { uploadLimiter } from '../middleware/rateLimiters.js';
import { verifyDocumentSignature } from '../utils/fileValidation.js';

const router = express.Router();

const canEdit = requireRole('super_admin', 'content_editor');

const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split('.').pop();
    const ok  = ['xlsx', 'xls', 'csv', 'docx', 'pdf'].includes(ext);
    ok ? cb(null, true) : cb(new Error(`File type .${ext} not supported`));
  }
});

// Bulk parse — returns preview, does NOT save
router.post('/bulk-parse',  adminProtect, canEdit, uploadLimiter, fileUpload.single('file'), verifyDocumentSignature(), parseProductFile);
// Bulk upload — saves validated products to DB
router.post('/bulk-upload', adminProtect, canEdit, uploadLimiter, bulkUploadProducts);

// Admin reads (all statuses incl. draft). Registered before '/:id' routes so
// '/' is never shadowed. Same roles that can already manage products/inventory.
// Read-only and cost-free (costPrice is select:false), and the admin Products
// screen was previously readable by every admin role via the public API — so
// all admin roles keep read access, to avoid regressing finance/viewer users.
const canViewProducts = requireRole('super_admin', 'finance_manager', 'store_manager', 'content_editor', 'viewer');
router.get('/', adminProtect, canViewProducts, adminListProducts);
router.get('/:id', adminProtect, canViewProducts, mongoIdParam('id'), validate, adminGetProduct);

router.post('/bulk', adminProtect, requireRole('super_admin', 'content_editor'), adminBulkImport);
router.post('/', adminProtect, canEdit, createProductRules, validate, adminCreateProduct);
router.put('/:id/inventory', adminProtect, requireRole('super_admin', 'store_manager', 'content_editor'), mongoIdParam('id'), validate, adminUpdateInventory);
router.get('/:id/cost-price', adminProtect, requireRole('super_admin'), mongoIdParam('id'), validate, adminGetProductCostPrice);
router.put('/:id', adminProtect, canEdit, mongoIdParam('id'), validate, adminUpdateProduct);
router.delete('/:id', adminProtect, requireRole('super_admin'), mongoIdParam('id'), validate, adminArchiveProduct);

export default router;
