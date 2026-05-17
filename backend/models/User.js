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
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    birthday: { type: Date },
    loyaltyPoints: { type: Number, default: 0 },

    /* ── new fields ── */
    phone: { type: String, trim: true },

    addresses: [addressSchema],

    preferences: {
      sizes: [{ type: String }],
      categories: [{ type: String }],
      colours: [{ type: String }]
    },

    savedPincode: { type: String, trim: true },

    wishlist: [wishlistItemSchema],

    expoPushToken: { type: String, trim: true }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

export default User;
