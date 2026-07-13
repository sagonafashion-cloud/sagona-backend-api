import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  label: { type: String, trim: true },      // e.g. "Home", "Office"
  name: { type: String, trim: true },
  line1: { type: String, trim: true },
  line2: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  pincode: { type: String, trim: true },
  phone: { type: String, trim: true },
  isDefault: { type: Boolean, default: false }
}, { _id: true });

const wishlistItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  addedAt: { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema(
  {
    /* ── existing fields (unchanged) ── */
    name: { type: String, required: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    birthday: { type: Date },
    loyaltyPoints: { type: Number, default: 0 },

    /* ── new fields ── */
    phone: { type: String, trim: true, unique: true, sparse: true },

    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },

    addresses: [addressSchema],

    preferences: {
      sizes: [{ type: String }],
      categories: [{ type: String }],
      colours: [{ type: String }]
    },

    savedPincode: { type: String, trim: true },

    wishlist: [wishlistItemSchema],

    expoPushToken: { type: String, trim: true },

    tryOnPhoto: {
      url:        { type: String },
      publicId:   { type: String },
      uploadedAt: { type: Date },
      approved:   { type: Boolean, default: true }
    },

    tryOnHistory: [{
      garmentProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      garmentName:      { type: String },
      resultImageUrl:   { type: String },
      createdAt:        { type: Date, default: Date.now }
    }],

    childProfiles: [{
      name: String,
      gender: { type: String, enum: ['boy', 'girl', 'unisex'] },
      dateOfBirth: Date,
      height: Number,
      weight: Number,
      chestCircumference: Number,
      waistCircumference: Number,
      hipCircumference: Number,
      shoulderWidth: Number,
      inseamLength: Number,
      lastMeasuredAt: Date,
      measurementMethod: {
        type: String,
        enum: ['camera', 'manual', 'tape_measure'],
        default: 'manual'
      },
      purchaseHistory: [{
        productId: mongoose.Schema.Types.ObjectId,
        productName: String,
        size: String,
        fitFeedback: String,
        purchasedAt: Date
      }],
      createdAt: { type: Date, default: Date.now }
    }]
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

export default User;
