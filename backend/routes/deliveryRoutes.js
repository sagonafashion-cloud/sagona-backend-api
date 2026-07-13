import express from 'express';
import axios from 'axios';
import { checkDelivery } from '../controllers/deliveryController.js';
import { validate, deliveryCheckRules } from '../middleware/validate.js';
import { pincodeLimiter } from '../middleware/rateLimiters.js';
import PincodeMap from '../models/PincodeMap.js';

const router = express.Router();

router.get('/pincode/:pincode', pincodeLimiter, async (req, res) => {
  const { pincode } = req.params;

  if (!/^\d{6}$/.test(pincode)) {
    return res.status(400).json({ success: false, message: 'Enter a valid 6-digit pincode' });
  }

  // STEP 1: Check own database first (fastest, no external call)
  try {
    const local = await PincodeMap.findOne({ pincode }).lean();
    if (local && local.city) {
      return res.json({ success: true, data: { city: local.city, state: local.state, pincode } });
    }
  } catch (e) {
    console.error('DB lookup error:', e.message);
  }

  // STEP 2: Try India Post API with browser-like user-agent
  try {
    const response = await axios.get(
      `https://api.postalpincode.in/pincode/${pincode}`,
      {
        timeout: 6000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Sagona/1.0)',
          'Accept': 'application/json'
        }
      }
    );
    const data = response.data;
    if (data?.[0]?.Status === 'Success' && data[0].PostOffice?.length > 0) {
      const po = data[0].PostOffice[0];
      const city = po.District || po.Block || po.Name || '';
      const state = po.State || '';
      if (city) {
        PincodeMap.findOneAndUpdate(
          { pincode },
          { pincode, city, state, lat: 0, lng: 0 },
          { upsert: true }
        ).catch(() => {});
        return res.json({ success: true, data: { city, state, pincode } });
      }
    }
  } catch (e) {
    console.log('India Post API failed:', e.message, '— trying fallback');
  }

  // STEP 3: Try alternative free pincode API
  try {
    const response = await axios.get(
      `https://pincode.vercel.app/${pincode}`,
      { timeout: 5000 }
    );
    const data = response.data;
    if (data?.city || data?.district) {
      const city = data.district || data.city || '';
      const state = data.state || '';
      if (city) {
        PincodeMap.findOneAndUpdate(
          { pincode },
          { pincode, city, state, lat: 0, lng: 0 },
          { upsert: true }
        ).catch(() => {});
        return res.json({ success: true, data: { city, state, pincode } });
      }
    }
  } catch (e) {
    console.log('Fallback API also failed:', e.message);
  }

  // STEP 4: Nothing worked
  return res.json({
    success: false,
    data: null,
    message: 'Pincode not found — please fill city and state manually'
  });
});

router.post('/check', pincodeLimiter, deliveryCheckRules, validate, checkDelivery);

export default router;
