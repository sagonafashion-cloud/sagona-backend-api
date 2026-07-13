import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';
import { Readable } from 'stream';
import User from '../models/User.js';
import Product from '../models/Product.js';

// POST /api/tryon/upload-photo
export const uploadUserPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No photo uploaded' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.tryOnPhoto?.publicId) {
      await cloudinary.uploader.destroy(user.tryOnPhoto.publicId).catch(() => {});
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `sagona-tryon/${req.user.id}`,
          public_id: 'profile-photo',
          overwrite: true,
          transformation: [
            { width: 768, crop: 'limit', quality: 'auto:good' },
            { format: 'jpg' }
          ],
          type: 'upload',
          access_mode: 'public'
        },
        (error, result) => (error ? reject(error) : resolve(result))
      );
      Readable.from(req.file.buffer).pipe(stream);
    });

    user.tryOnPhoto = {
      url:        result.secure_url,
      publicId:   result.public_id,
      uploadedAt: new Date()
    };
    await user.save();

    res.json({ success: true, data: { url: result.secure_url }, message: 'Photo uploaded successfully' });
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/tryon/photo
export const deleteUserPhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user?.tryOnPhoto?.publicId) {
      await cloudinary.uploader.destroy(user.tryOnPhoto.publicId).catch(() => {});
    }
    user.tryOnPhoto = undefined;
    await user.save();
    res.json({ success: true, message: 'Photo deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/tryon/photo
export const getUserPhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('tryOnPhoto').lean();
    res.json({
      success: true,
      data: {
        hasPhoto:   !!user?.tryOnPhoto?.url,
        url:        user?.tryOnPhoto?.url || null,
        uploadedAt: user?.tryOnPhoto?.uploadedAt || null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/tryon/generate
export const generateTryOn = async (req, res) => {
  try {
    const { productId, garmentImageUrl } = req.body;

    const user = await User.findById(req.user.id).select('tryOnPhoto').lean();
    if (!user?.tryOnPhoto?.url) {
      return res.status(400).json({ success: false, message: 'NO_PHOTO', data: null });
    }

    let garmentUrl = garmentImageUrl;
    if (!garmentUrl && productId) {
      const product = await Product.findById(productId).select('images image name').lean();
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
      garmentUrl = product.images?.[0] || product.image;
      if (!garmentUrl) {
        return res.status(400).json({ success: false, message: 'This product has no image available for try-on' });
      }
    }

    if (!garmentUrl) {
      return res.status(400).json({ success: false, message: 'No garment image provided' });
    }

    const modelPhotoUrl = user.tryOnPhoto.url;

    if (process.env.FASHN_API_KEY) {
      try {
        const fashnResult = await callFashnAI(modelPhotoUrl, garmentUrl);
        if (fashnResult.success) {
          return res.json({ success: true, data: { resultUrl: fashnResult.url, provider: 'fashn' } });
        }
      } catch (e) {
        console.log('Fashn.ai failed, trying Replicate:', e.message);
      }
    }

    if (process.env.REPLICATE_API_TOKEN) {
      try {
        const replicateResult = await callReplicate(modelPhotoUrl, garmentUrl);
        if (replicateResult.success) {
          return res.json({ success: true, data: { resultUrl: replicateResult.url, provider: 'replicate' } });
        }
      } catch (e) {
        console.log('Replicate also failed:', e.message);
      }
    }

    return res.status(503).json({
      success: false,
      message: 'Virtual try-on service is temporarily unavailable. Please try again in a moment.'
    });
  } catch (err) {
    console.error('generateTryOn error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

async function callFashnAI(modelImageUrl, garmentImageUrl) {
  const submitRes = await axios.post(
    'https://api.fashn.ai/v1/run',
    { model_image: modelImageUrl, garment_image: garmentImageUrl, category: 'tops', mode: 'balanced' },
    { headers: { Authorization: `Bearer ${process.env.FASHN_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 10000 }
  );

  const predictionId = submitRes.data?.id;
  if (!predictionId) throw new Error('No prediction ID from Fashn.ai');

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await axios.get(
      `https://api.fashn.ai/v1/status/${predictionId}`,
      { headers: { Authorization: `Bearer ${process.env.FASHN_API_KEY}` }, timeout: 5000 }
    );
    const status = statusRes.data?.status;
    if (status === 'completed') {
      const outputUrl = statusRes.data?.output?.[0] || statusRes.data?.output;
      if (outputUrl) return { success: true, url: outputUrl };
      throw new Error('No output URL in completed response');
    }
    if (status === 'failed') throw new Error(statusRes.data?.error || 'Fashn.ai prediction failed');
  }

  throw new Error('Fashn.ai prediction timed out after 60 seconds');
}

async function callReplicate(modelImageUrl, garmentImageUrl) {
  const submitRes = await axios.post(
    'https://api.replicate.com/v1/predictions',
    {
      version: 'c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4',
      input: {
        human_img: modelImageUrl,
        garm_img: garmentImageUrl,
        garment_des: 'fashion garment',
        is_checked: true,
        is_checked_crop: false,
        denoise_steps: 30,
        seed: 42
      }
    },
    { headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 10000 }
  );

  const predictionId = submitRes.data?.id;
  if (!predictionId) throw new Error('No prediction ID from Replicate');

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await axios.get(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      { headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` } }
    );
    const status = statusRes.data?.status;
    if (status === 'succeeded') {
      const output = statusRes.data?.output;
      const url = Array.isArray(output) ? output[0] : output;
      if (url) return { success: true, url };
      throw new Error('No output in Replicate response');
    }
    if (status === 'failed') throw new Error(statusRes.data?.error || 'Replicate failed');
  }

  throw new Error('Replicate timed out');
}

// POST /api/tryon/save-result
export const saveTryOnResult = async (req, res) => {
  try {
    const { resultImageUrl, garmentProductId, garmentName } = req.body;
    await User.findByIdAndUpdate(req.user.id, {
      $push: {
        tryOnHistory: {
          $each: [{ garmentProductId, garmentName, resultImageUrl, createdAt: new Date() }],
          $position: 0,
          $slice: 20
        }
      }
    });
    res.json({ success: true, message: 'Saved to your try-on history' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
