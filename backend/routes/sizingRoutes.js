import express from 'express';
import { protect } from '../middleware/auth.js';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';
import * as C from '../controllers/sizingController.js';

const router = express.Router();

// Public
router.post('/recommend', C.getRecommendation);

// Customer — requires login
router.get('/profiles',      protect, C.getChildProfiles);
router.post('/profiles',     protect, C.saveChildProfile);
router.put('/profiles/:id',  protect, C.updateChildProfile);
router.delete('/profiles/:id', protect, C.deleteChildProfile);
router.post('/feedback',     protect, C.submitFitFeedback);

// Admin
router.get('/admin/analytics', adminProtect, requireRole('super_admin', 'finance_manager', 'store_manager'), C.getSizingAnalytics);
router.get('/admin/feedback',  adminProtect, requireRole('super_admin', 'store_manager'), C.getAllFeedback);

export default router;
