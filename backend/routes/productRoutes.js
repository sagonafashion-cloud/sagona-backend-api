import express from 'express';
import { getProducts, createProduct, deleteProduct } from '../controllers/productController.js';
import { protect, adminOnly } from "../middleware/auth.js";

const router = express.Router();

router.get('/', getProducts);
router.post('/', protect, admin, createProduct);
router.delete('/:id', protect, admin, deleteProduct);

export default router;