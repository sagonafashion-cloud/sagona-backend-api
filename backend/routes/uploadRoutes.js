import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { adminProtect } from '../middleware/adminAuth.js';

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files allowed'));
    }
    cb(null, true);
  }
});

const uploadToCloudinary = (buffer, options) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    stream.end(buffer);
  });

/* POST /api/admin/upload/image */
router.post('/image', adminProtect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }

    const resized = await sharp(req.file.buffer)
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const result = await uploadToCloudinary(resized, {
      folder: 'sagona/products',
      resource_type: 'image',
      format: 'webp'
    });

    res.json({
      success: true,
      data: { url: result.secure_url, publicId: result.public_id }
    });
  } catch (err) {
    console.error('uploadImage:', err);
    res.status(500).json({ success: false, message: 'Image upload failed' });
  }
});

/* DELETE /api/admin/upload/image */
router.delete('/image', adminProtect, async (req, res) => {
  try {
    const { publicId } = req.body;
    if (!publicId) return res.status(400).json({ success: false, message: 'publicId required' });

    await cloudinary.uploader.destroy(publicId);
    res.json({ success: true, message: 'Image deleted' });
  } catch (err) {
    console.error('deleteImage:', err);
    res.status(500).json({ success: false, message: 'Image deletion failed' });
  }
});

export default router;
