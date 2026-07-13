import express from 'express';
import multer from 'multer';
import { protect } from '../middleware/auth.js';
import {
  uploadUserPhoto, deleteUserPhoto, getUserPhoto,
  generateTryOn, saveTryOnResult
} from '../controllers/tryOnController.js';
import { uploadLimiter, aiGenerationLimiter } from '../middleware/rateLimiters.js';
import { verifyImageSignature } from '../utils/fileValidation.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

router.get('/photo',          protect, getUserPhoto);
router.post('/upload-photo',  protect, uploadLimiter, upload.single('photo'), verifyImageSignature({ field: 'photo' }), uploadUserPhoto);
router.delete('/photo',       protect, deleteUserPhoto);
router.post('/generate',      protect, aiGenerationLimiter, generateTryOn);
router.post('/save-result',   protect, saveTryOnResult);

export default router;
