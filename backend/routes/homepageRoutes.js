import express from 'express';
import multer from 'multer';
import {
  getSections, getAllSections, createSection,
  updateSection, deleteSection, reorderSections, uploadMedia
} from '../controllers/homepageController.js';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';
import { verifyImageOrVideoSignature } from '../utils/fileValidation.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
      return cb(new Error('Only image or video files allowed'));
    }
    cb(null, true);
  }
});

// Public
router.get('/homepage/sections', getSections);

// Admin
router.get('/admin/homepage/sections',    adminProtect, getAllSections);
router.post('/admin/homepage/sections',   adminProtect, requireRole('super_admin', 'content_editor'), createSection);
router.put('/admin/homepage/reorder',     adminProtect, requireRole('super_admin', 'content_editor'), reorderSections);
router.put('/admin/homepage/sections/:id',    adminProtect, requireRole('super_admin', 'content_editor'), updateSection);
router.delete('/admin/homepage/sections/:id', adminProtect, requireRole('super_admin'), deleteSection);
router.post('/admin/homepage/upload',     adminProtect, requireRole('super_admin', 'content_editor'),
  upload.single('media'), verifyImageOrVideoSignature({ field: 'media' }), uploadMedia);

export default router;
