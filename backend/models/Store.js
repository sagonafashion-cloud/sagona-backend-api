import mongoose from 'mongoose';

const storeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    lat: { type: Number },
    lng: { type: Number },
    gstin: { type: String, trim: true, uppercase: true },
    phone: { type: String, trim: true },
    dispatchEnabled: { type: Boolean, default: true },
    dispatchCutoffTime: { type: String, default: '15:00' }, // "HH:MM" 24h
    holidays: [{ type: Date }],
    priority: { type: Number, default: 0 },  // higher = preferred when equidistant
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

storeSchema.index({ isActive: 1, priority: -1 });
storeSchema.index({ pincode: 1 });

const Store = mongoose.model('Store', storeSchema);

export default Store;
