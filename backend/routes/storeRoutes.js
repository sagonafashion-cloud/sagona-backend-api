import express from 'express';
import { getStores, getStoreById, createStore, updateStore, deleteStore } from '../controllers/storeController.js';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';

const router = express.Router();

// Public
router.get('/', getStores);
router.get('/:id', getStoreById);

// Admin (super_admin only)
router.post('/', adminProtect, requireRole('super_admin'), createStore);
router.put('/:id', adminProtect, requireRole('super_admin'), updateStore);
router.delete('/:id', adminProtect, requireRole('super_admin'), deleteStore);

export default router;
