import jwt from 'jsonwebtoken';
import Store from '../models/Store.js';
import { logAdminActivity } from '../utils/activityLogger.js';

// These endpoints are public (store-locator UI needs no login), but
// includeInactive and GSTIN/phone should only be visible to a real admin —
// so we opportunistically check for a valid admin bearer token without
// making the route itself require one.
const isAdminRequest = (req) => {
  const token = req.headers.authorization?.startsWith('Bearer')
    ? req.headers.authorization.split(' ')[1] : null;
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET, { algorithms: ['HS256'] });
    return decoded.type === 'admin';
  } catch {
    return false;
  }
};

export const getStores = async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const isAdmin = isAdminRequest(req);

    if (includeInactive && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required to view inactive stores' });
    }

    const query = includeInactive ? {} : { isActive: true };
    // Store count is small and admin-managed, but cap the query so an
    // unbounded find() can't become a problem if the list ever grows.
    let q = Store.find(query).sort({ priority: -1, name: 1 }).limit(200);
    if (!isAdmin) q = q.select('-gstin -phone');
    const stores = await q;
    res.json({ success: true, data: stores });
  } catch (err) {
    console.error('getStores:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stores' });
  }
};

export const getStoreById = async (req, res) => {
  try {
    let q = Store.findById(req.params.id);
    if (!isAdminRequest(req)) q = q.select('-gstin -phone');
    const store = await q;
    if (!store) return res.status(404).json({ success: false, message: 'Store not found' });
    res.json({ success: true, data: store });
  } catch {
    res.status(400).json({ success: false, message: 'Invalid store id' });
  }
};

export const createStore = async (req, res) => {
  try {
    const { name, address, city, state, pincode, lat, lng, gstin, phone,
            dispatchEnabled, dispatchCutoffTime, priority } = req.body;

    if (!name) return res.status(400).json({ success: false, message: 'Store name is required' });

    const store = await Store.create({
      name, address, city, state, pincode, lat, lng, gstin, phone,
      dispatchEnabled, dispatchCutoffTime, priority
    });

    logAdminActivity(req, 'store.create', {
      targetType: 'Store',
      targetId: store._id,
      details: { name: store.name, city: store.city }
    });

    res.status(201).json({ success: true, data: store });
  } catch (err) {
    console.error('createStore:', err);
    res.status(500).json({ success: false, message: 'Failed to create store' });
  }
};

export const updateStore = async (req, res) => {
  try {
    // Explicit field whitelist — never pass raw req.body into an update
    // (prevents mass assignment of fields not intended to be client-settable,
    // e.g. isActive/deletedAt which have their own dedicated endpoints).
    const { name, address, city, state, pincode, lat, lng, gstin, phone,
            dispatchEnabled, dispatchCutoffTime, priority } = req.body;
    const update = {};
    if (name               !== undefined) update.name               = name;
    if (address            !== undefined) update.address            = address;
    if (city               !== undefined) update.city               = city;
    if (state              !== undefined) update.state              = state;
    if (pincode            !== undefined) update.pincode            = pincode;
    if (lat                !== undefined) update.lat                = lat;
    if (lng                !== undefined) update.lng                = lng;
    if (gstin              !== undefined) update.gstin              = gstin;
    if (phone              !== undefined) update.phone              = phone;
    if (dispatchEnabled    !== undefined) update.dispatchEnabled    = dispatchEnabled;
    if (dispatchCutoffTime !== undefined) update.dispatchCutoffTime = dispatchCutoffTime;
    if (priority           !== undefined) update.priority           = priority;

    const store = await Store.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!store) return res.status(404).json({ success: false, message: 'Store not found' });

    logAdminActivity(req, 'store.update', {
      targetType: 'Store',
      targetId: store._id,
      details: { changedFields: Object.keys(update), after: update }
    });

    res.json({ success: true, data: store });
  } catch (err) {
    console.error('updateStore:', err);
    res.status(500).json({ success: false, message: 'Failed to update store' });
  }
};

export const toggleStore = async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) return res.status(404).json({ success: false, message: 'Store not found' });
    const wasActive = store.isActive;
    store.isActive = !store.isActive;
    await store.save();

    logAdminActivity(req, 'store.toggle', {
      targetType: 'Store',
      targetId: store._id,
      details: { name: store.name, before: wasActive, after: store.isActive }
    });

    res.json({
      success: true,
      data: store,
      message: `Store ${store.isActive ? 'activated' : 'deactivated'}`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteStore = async (req, res) => {
  try {
    const store = await Store.findByIdAndUpdate(
      req.params.id,
      { isActive: false, deletedAt: new Date() },
      { new: true }
    );
    if (!store) return res.status(404).json({ success: false, message: 'Store not found' });

    logAdminActivity(req, 'store.delete', {
      targetType: 'Store',
      targetId: store._id,
      details: { name: store.name }
    });

    res.json({ success: true, message: 'Store deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
