import NodeCache from 'node-cache';
import Product from '../models/Product.js';
import Store from '../models/Store.js';
import PincodeMap from '../models/PincodeMap.js';

const cache = new NodeCache({ stdTTL: 1800 }); // 30-min TTL

const FREE_SHIPPING_THRESHOLD = Number(process.env.FREE_SHIPPING_THRESHOLD) || 999;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceToEta(km) {
  if (km < 200)  return 2;
  if (km < 500)  return 3;
  if (km < 1000) return 4;
  return 6;
}

function etaDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const getPincodeInfo = async (req, res) => {
  const { pincode } = req.params;
  if (!pincode || !/^\d{6}$/.test(pincode)) {
    return res.status(400).json({ success: false, message: 'Pincode must be 6 digits' });
  }

  // Check local DB first
  try {
    const local = await PincodeMap.findOne({ pincode }).lean();
    if (local) {
      return res.json({ success: true, data: { city: local.city, state: local.state, pincode } });
    }
  } catch {}

  // Fallback: proxy to India Post API (avoids browser CORS issues)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://api.postalpincode.in/pincode/${pincode}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    const data = await response.json();

    if (data?.[0]?.Status === 'Success' && data[0].PostOffice?.length > 0) {
      const po    = data[0].PostOffice[0];
      const city  = po.District || po.Block || po.Name || '';
      const state = po.State || '';

      if (city && state) {
        PincodeMap.findOneAndUpdate(
          { pincode },
          { pincode, city, state, lat: 0, lng: 0 },
          { upsert: true, new: true }
        ).catch(() => {});
      }

      return res.json({ success: true, data: { city, state, pincode } });
    }

    return res.json({ success: false, data: null, message: 'Pincode not found in India Post database' });
  } catch (err) {
    console.error('getPincodeInfo India Post error for', pincode, ':', err.message);
    return res.status(500).json({ success: false, message: 'Pincode lookup failed — please fill manually' });
  }
};

export const checkDelivery = async (req, res) => {
  try {
    const { sku, pincode, colour, size } = req.body;
    if (!sku || !pincode) {
      return res.status(400).json({ success: false, message: 'sku and pincode required' });
    }

    const cacheKey = `${sku}:${colour || ''}:${size || ''}:${pincode}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, data: cached, cached: true });

    // Find customer pincode coordinates
    const customerPin = await PincodeMap.findOne({ pincode });
    if (!customerPin?.lat) {
      return res.json({
        success: true,
        data: { available: false, message: 'Pincode not serviceable' }
      });
    }

    // Find product and check stock in variants
    const product = await Product.findOne({ sku }).populate('stores.storeId');
    if (!product) {
      return res.json({ success: true, data: { available: false, message: 'Product not found' } });
    }

    // Find variants matching colour/size with stock > 0
    const matchingVariants = product.variants.filter((v) => {
      const colourMatch = !colour || v.colour?.toLowerCase() === colour.toLowerCase();
      const sizeMatch   = !size   || v.size === size;
      return colourMatch && sizeMatch && v.stock > 0;
    });

    // Also check store-level stock
    const stockingStores = product.stores.filter((s) => s.stock > 0 && s.storeId?.isActive);

    const hasSomeStock = matchingVariants.length > 0 || stockingStores.length > 0;
    if (!hasSomeStock) {
      const result = { available: false, message: 'Out of stock' };
      cache.set(cacheKey, result);
      return res.json({ success: true, data: result });
    }

    // Get store documents for distance calculation
    const storeIds = stockingStores.map((s) => s.storeId._id || s.storeId);
    const stores = await Store.find({ _id: { $in: storeIds }, isActive: true, lat: { $exists: true } });

    if (!stores.length) {
      const result = { available: true, storeName: 'Warehouse', storeCity: '', etaDays: 5, etaDate: etaDate(5), codAvailable: true, freeShipping: false };
      cache.set(cacheKey, result);
      return res.json({ success: true, data: result });
    }

    // Pick nearest store (or highest priority when equidistant)
    let nearest = null;
    let minDist = Infinity;

    for (const store of stores) {
      const dist = haversineKm(store.lat, store.lng, customerPin.lat, customerPin.lng);
      if (dist < minDist || (dist === minDist && store.priority > nearest.priority)) {
        minDist = dist;
        nearest = store;
      }
    }

    const etaDays  = distanceToEta(minDist);
    const result = {
      available: true,
      storeName: nearest.name,
      storeCity: nearest.city,
      etaDays,
      etaDate: etaDate(etaDays),
      codAvailable: true,
      freeShipping: product.price >= FREE_SHIPPING_THRESHOLD
    };

    cache.set(cacheKey, result);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('checkDelivery:', err);
    res.status(500).json({ success: false, message: 'Delivery check failed' });
  }
};
