import Product from '../models/Product.js';

/* ── helpers ── */
const buildListQuery = (query) => {
  const filter = {};

  if (query.status)      filter.status = query.status;
  else                   filter.status = 'active'; // public default

  if (query.category)    filter.category = query.category;
  if (query.subcategory) filter.subcategory = query.subcategory;
  if (query.gender)      filter.gender = query.gender;
  if (query.ageGroup)    filter.ageGroup = query.ageGroup;
  if (query.featured)    filter.featured = query.featured === 'true';

  if (query.tags) {
    const tags = Array.isArray(query.tags) ? query.tags : query.tags.split(',');
    filter.tags = { $in: tags };
  }

  if (query.minPrice || query.maxPrice) {
    filter.price = {};
    if (query.minPrice) filter.price.$gte = Number(query.minPrice);
    if (query.maxPrice) filter.price.$lte = Number(query.maxPrice);
  }

  if (query.colour) filter['variants.colour'] = { $regex: query.colour, $options: 'i' };
  if (query.size)   filter['variants.size']   = query.size;
  if (query.storeId) filter['stores.storeId'] = query.storeId;

  if (query.search) {
    filter.$or = [
      { name: { $regex: query.search, $options: 'i' } },
      { description: { $regex: query.search, $options: 'i' } },
      { sku: { $regex: query.search, $options: 'i' } }
    ];
  }

  return filter;
};

/* ═══════════════════════════════════
   PUBLIC
═══════════════════════════════════ */

export const getProducts = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    // Allow admins to see non-active products
    const filter = req.query.status
      ? buildListQuery(req.query)
      : { ...buildListQuery(req.query), status: { $ne: 'archived' } };

    const sort = req.query.sort === 'price_asc'  ? { price: 1 }
               : req.query.sort === 'price_desc' ? { price: -1 }
               : { createdAt: -1 };

    const [data, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(limit).populate('stores.storeId', 'name city'),
      Product.countDocuments(filter)
    ]);

    res.json({ success: true, data, total, page, limit });
  } catch (err) {
    console.error('getProducts:', err);
    res.status(500).json({ success: false, message: 'Unable to fetch products' });
  }
};

export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('stores.storeId', 'name city state');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch {
    res.status(400).json({ success: false, message: 'Invalid product id' });
  }
};

/* ═══════════════════════════════════
   ADMIN (customer admin role — legacy)
═══════════════════════════════════ */

export const createProduct = async (req, res) => {
  try {
    const { name, price, image, description, featured } = req.body;

    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'name and price required' });
    }

    const product = await Product.create({ name, price, image, description, featured: !!featured });
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    console.error('createProduct:', err);
    res.status(500).json({ success: false, message: 'Unable to create product' });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted' });
  } catch {
    res.status(400).json({ success: false, message: 'Invalid product id' });
  }
};

/* ═══════════════════════════════════
   ADMIN PANEL (AdminUser roles)
═══════════════════════════════════ */

export const adminCreateProduct = async (req, res) => {
  try {
    const {
      name, price, mrp, image, images, description, featured,
      sku, category, subcategory, gender, ageGroup, tags,
      gstSlab, hsnCode, fabric, careInstructions, weight,
      status, publishAt, variants, stores
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'name and price required' });
    }

    const product = await Product.create({
      name, price, mrp, image, images: images || [],
      description, featured: !!featured,
      sku, category, subcategory, gender, ageGroup, tags: tags || [],
      gstSlab, hsnCode, fabric, careInstructions, weight,
      status: status || 'active', publishAt,
      variants: variants || [], stores: stores || []
    });

    res.status(201).json({ success: true, data: product });
  } catch (err) {
    console.error('adminCreateProduct:', err);
    res.status(500).json({ success: false, message: 'Unable to create product' });
  }
};

export const adminUpdateProduct = async (req, res) => {
  try {
    // Explicit field whitelist (mirrors adminCreateProduct) — never pass raw
    // req.body into an update to prevent mass assignment of fields the admin
    // UI doesn't intend to expose.
    const {
      name, price, mrp, image, images, description, featured,
      sku, category, subcategory, gender, ageGroup, tags,
      gstSlab, hsnCode, fabric, careInstructions, weight,
      status, publishAt, variants, stores
    } = req.body;

    const update = {};
    if (name             !== undefined) update.name             = name;
    if (price             !== undefined) update.price             = price;
    if (mrp               !== undefined) update.mrp               = mrp;
    if (image             !== undefined) update.image             = image;
    if (images            !== undefined) update.images            = images;
    if (description       !== undefined) update.description       = description;
    if (featured          !== undefined) update.featured          = !!featured;
    if (sku               !== undefined) update.sku               = sku;
    if (category          !== undefined) update.category          = category;
    if (subcategory       !== undefined) update.subcategory       = subcategory;
    if (gender            !== undefined) update.gender            = gender;
    if (ageGroup          !== undefined) update.ageGroup          = ageGroup;
    if (tags              !== undefined) update.tags              = tags;
    if (gstSlab           !== undefined) update.gstSlab           = gstSlab;
    if (hsnCode           !== undefined) update.hsnCode           = hsnCode;
    if (fabric            !== undefined) update.fabric            = fabric;
    if (careInstructions  !== undefined) update.careInstructions  = careInstructions;
    if (weight            !== undefined) update.weight            = weight;
    if (status            !== undefined) update.status            = status;
    if (publishAt         !== undefined) update.publishAt         = publishAt;
    if (variants          !== undefined) update.variants          = variants;
    if (stores            !== undefined) update.stores            = stores;

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) {
    console.error('adminUpdateProduct:', err);
    res.status(500).json({ success: false, message: 'Unable to update product' });
  }
};

export const adminArchiveProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { status: 'archived' },
      { new: true }
    );
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product archived', data: product });
  } catch {
    res.status(400).json({ success: false, message: 'Invalid product id' });
  }
};

export const adminBulkImport = async (req, res) => {
  try {
    const products = req.body;
    if (!Array.isArray(products) || !products.length) {
      return res.status(400).json({ success: false, message: 'Provide an array of products' });
    }

    const inserted = await Product.insertMany(products, { ordered: false });
    res.status(201).json({ success: true, data: inserted, count: inserted.length });
  } catch (err) {
    console.error('adminBulkImport:', err);
    res.status(500).json({ success: false, message: 'Bulk import failed', error: err.message });
  }
};

export const adminUpdateInventory = async (req, res) => {
  try {
    const { stores } = req.body; // [{ storeId, stock }]
    if (!Array.isArray(stores)) {
      return res.status(400).json({ success: false, message: 'stores array required' });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { stores },
      { new: true }
    );
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) {
    console.error('adminUpdateInventory:', err);
    res.status(500).json({ success: false, message: 'Inventory update failed' });
  }
};
