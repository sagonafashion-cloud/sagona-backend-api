import express from 'express';
import { getProducts, getProductById, createProduct, deleteProduct } from '../controllers/productController.js';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';

const router = express.Router();

router.get('/', getProducts);
router.get('/:id', getProductById);
router.post('/', adminProtect, requireRole('super_admin', 'content_editor'), createProduct);
router.delete('/:id', adminProtect, requireRole('super_admin'), deleteProduct);

export default router;