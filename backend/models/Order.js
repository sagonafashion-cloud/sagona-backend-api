import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  items: Array,
  total: Number,
  paymentMethod: String,
  address: String,
  customer: Object,
  status: { type: String, default: 'PENDING' }
}, { timestamps: true });

export default mongoose.model('Order', orderSchema);