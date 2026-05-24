import { Readable } from 'stream';
import { v2 as cloudinary } from 'cloudinary';
import HomepageSection from '../models/HomepageSection.js';

// GET /api/homepage/sections — public
export const getSections = async (req, res) => {
  try {
    const sections = await HomepageSection.find({ isActive: true }).sort({ order: 1 }).lean();
    res.json({ success: true, data: sections });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/admin/homepage/sections — admin, all
export const getAllSections = async (req, res) => {
  try {
    const sections = await HomepageSection.find({}).sort({ order: 1 }).lean();
    res.json({ success: true, data: sections });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/admin/homepage/sections
export const createSection = async (req, res) => {
  try {
    const section = await HomepageSection.create(req.body);
    res.json({ success: true, data: section });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/admin/homepage/sections/:id
export const updateSection = async (req, res) => {
  try {
    const section = await HomepageSection.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found' });
    res.json({ success: true, data: section });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/admin/homepage/sections/:id
export const deleteSection = async (req, res) => {
  try {
    const section = await HomepageSection.findById(req.params.id);
    if (!section) return res.status(404).json({ success: false, message: 'Section not found' });

    if (section.mediaPublicId) {
      await cloudinary.uploader.destroy(section.mediaPublicId, {
        resource_type: section.mediaType === 'video' ? 'video' : 'image'
      }).catch(() => {});
    }
    await section.deleteOne();
    res.json({ success: true, message: 'Section deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/admin/homepage/sections/reorder
export const reorderSections = async (req, res) => {
  try {
    const { order } = req.body; // [{ id, order }, ...]
    await Promise.all(order.map(item =>
      HomepageSection.findByIdAndUpdate(item.id, { order: item.order })
    ));
    res.json({ success: true, message: 'Order saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/admin/homepage/upload
export const uploadMedia = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });

    const isVideo = req.file.mimetype.startsWith('video/');
    const resourceType = isVideo ? 'video' : 'image';

    const uploadOptions = {
      folder: 'sagona-homepage',
      resource_type: resourceType,
    };

    if (isVideo) {
      uploadOptions.eager = [{ format: 'jpg', transformation: [{ start_offset: '1' }] }];
      uploadOptions.eager_async = false;
    } else {
      uploadOptions.transformation = [
        { width: 1920, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
      ];
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(uploadOptions, (err, r) =>
        err ? reject(err) : resolve(r)
      );
      Readable.from(req.file.buffer).pipe(stream);
    });

    const response = {
      url:      result.secure_url,
      publicId: result.public_id,
      type:     isVideo ? 'video' : 'image',
      width:    result.width,
      height:   result.height,
      format:   result.format,
    };

    if (isVideo) {
      response.duration  = result.duration;
      response.posterUrl = result.eager?.[0]?.secure_url ||
        result.secure_url.replace('/upload/', '/upload/f_jpg,so_1/');
    }

    res.json({ success: true, data: response });
  } catch (err) {
    console.error('Homepage media upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
