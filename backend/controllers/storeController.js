import Store from '../models/Store.js';

export const getStores = async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const query = includeInactive ? {} : { isActive: true };
    const stores = await Store.find(query).sort({ priority: -1, name: 1 });
    res.json({ success: true, data: stores });
  } catch (err) {
    console.error('getStores:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stores' });
  }
};

export const getStoreById = async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
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
    store.isActive = !store.isActive;
    await store.save();
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
    res.json({ success: true, message: 'Store deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
