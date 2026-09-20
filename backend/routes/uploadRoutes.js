import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';
import { verifyImageSignature, verifyFileSignature, IMAGE_KINDS } from '../utils/fileValidation.js';
import { logAdminActivity } from '../utils/activityLogger.js';

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
router.post('/image', adminProtect, requireRole('super_admin', 'content_editor'), upload.single('image'), verifyImageSignature({ field: 'image' }), async (req, res) => {
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

    logAdminActivity(req, 'upload.image_create', {
      targetType: 'CloudinaryAsset',
      targetId: result.public_id,
      details: { url: result.secure_url }
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
router.delete('/image', adminProtect, requireRole('super_admin', 'content_editor'), async (req, res) => {
  try {
    const { publicId } = req.body;
    if (!publicId) return res.status(400).json({ success: false, message: 'publicId required' });

    await cloudinary.uploader.destroy(publicId);

    logAdminActivity(req, 'upload.image_delete', {
      targetType: 'CloudinaryAsset',
      targetId: publicId
    });

    res.json({ success: true, message: 'Image deleted' });
  } catch (err) {
    console.error('deleteImage:', err);
    res.status(500).json({ success: false, message: 'Image deletion failed' });
  }
});

// Separate multer instance (not shared with `upload` above) so relaxing the
// file-type filter here can never accidentally widen what the product-image
// endpoint accepts.
const uploadAttachment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf') {
      return cb(new Error('Only image or PDF files allowed'));
    }
    cb(null, true);
  }
});

/* POST /api/admin/upload/invoice-attachment
 * Scanned vendor purchase-invoice copies (see PurchaseInvoice.js's
 * attachmentUrl) — unlike product images, these are legitimately PDFs as
 * often as photos/scans, so this endpoint accepts both instead of reusing
 * the image-only /image route. Gated to super_admin only, matching the
 * purchase-invoice CRUD restriction (see purchaseInvoiceRoutes.js). */
router.post(
  '/invoice-attachment',
  adminProtect,
  requireRole('super_admin'),
  uploadAttachment.single('file'),
  verifyFileSignature([...IMAGE_KINDS, 'pdf'], { field: 'attachment' }),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file provided' });
      }

      const isPdf = req.file.mimetype === 'application/pdf';

      // PDFs are stored as-is — sharp can't process a PDF buffer, and unlike
      // product photos there's no size/format normalization to do for a
      // vendor's own scanned document.
      const buffer = isPdf
        ? req.file.buffer
        : await sharp(req.file.buffer).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();

      const result = await uploadToCloudinary(buffer, {
        folder: 'sagona/purchase_invoices',
        // Cloudinary serves non-image files (PDFs) under its 'raw' resource
        // type; 'image' still applies for actual image scans so thumbnails/
        // transformations keep working the same way product images do.
        resource_type: isPdf ? 'raw' : 'image',
        format: isPdf ? 'pdf' : 'webp'
      });

      logAdminActivity(req, 'upload.invoice_attachment_create', {
        targetType: 'CloudinaryAsset',
        targetId: result.public_id,
        details: { url: result.secure_url, kind: isPdf ? 'pdf' : 'image' }
      });

      res.json({
        success: true,
        data: { url: result.secure_url, publicId: result.public_id, kind: isPdf ? 'pdf' : 'image' }
      });
    } catch (err) {
      console.error('uploadInvoiceAttachment:', err);
      res.status(500).json({ success: false, message: 'Attachment upload failed' });
    }
  }
);

export default router;
