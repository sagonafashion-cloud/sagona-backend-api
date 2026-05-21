import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema({
  colour: { type: String, trim: true },
  size: { type: String, trim: true },
  sku: { type: String, trim: true },
  stock: { type: Number, default: 0, min: 0 }
}, { _id: false });

const storeStockSchema = new mongoose.Schema({
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  stock: { type: Number, default: 0, min: 0 }
}, { _id: false });

const productSchema = new mongoose.Schema(
  {
    /* ── existing fields (kept for backward compat) ── */
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    image: { type: String },          // legacy single-image field
    description: { type: String, default: '' },
    featured: { type: Boolean, default: false },

    /* ── identity ── */
    sku: { type: String, unique: true, sparse: true, trim: true },
    category: {
      type: String,
      trim: true,
      lowercase: true,
      enum: ['kids', 'women', 'men', 'accessories', '']
    },
    subcategory: { type: String, trim: true },
    gender: {
      type: String,
      enum: ['boys', 'girls', 'unisex', 'women', 'men', '']
    },
    ageGroup: {
      type: String,
      enum: ['0-2', '2-5', '5-10', '10-14', 'adult', '']
    },
    tags: [{ type: String, trim: true }],

    /* ── pricing & GST ── */
    mrp: { type: Number, min: 0 },
    gstSlab: { type: Number, enum: [0, 5, 12, 18, 28], default: 5 },
    hsnCode: { type: String, trim: true },

    /* ── content ── */
    images: [{ type: String }],       // array of Cloudinary URLs
    fabric: { type: String, trim: true },
    careInstructions: { type: String, trim: true },
    weight: { type: Number, min: 0 }, // grams

    /* ── lifecycle ── */
    status: {
      type: String,
      enum: ['draft', 'active', 'out_of_stock', 'archived'],
      default: 'active'
    },
    publishAt: { type: Date },

    /* ── inventory ── */
    variants: [variantSchema],
    stores: [storeStockSchema]
  },
  { timestamps: true }
);

productSchema.index({ category: 1, status: 1 });
productSchema.index({ tags: 1 });

const Product = mongoose.model('Product', productSchema);

export default Product;
