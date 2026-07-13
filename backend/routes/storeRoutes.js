import express from 'express';
import { getStores, getStoreById, createStore, updateStore, toggleStore, deleteStore } from '../controllers/storeController.js';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';
import { validate, mongoIdParam } from '../middleware/validate.js';

const router = express.Router();

// Public
router.get('/', getStores);
router.get('/:id', mongoIdParam('id'), validate, getStoreById);

// Admin (super_admin only)
router.post('/', adminProtect, requireRole('super_admin'), createStore);
router.put('/:id', adminProtect, requireRole('super_admin'), mongoIdParam('id'), validate, updateStore);
router.patch('/:id/toggle', adminProtect, requireRole('super_admin'), mongoIdParam('id'), validate, toggleStore);
router.delete('/:id', adminProtect, requireRole('super_admin'), mongoIdParam('id'), validate, deleteStore);

export default router;
