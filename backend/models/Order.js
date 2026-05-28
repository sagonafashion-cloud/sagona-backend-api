import mongoose from 'mongoose';

/* ── sub-schemas ── */

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true },
  sku: { type: String },
  colour: { type: String },
  size: { type: String },
  qty: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true },
  mrp: { type: Number },
  gstSlab: { type: Number, enum: [0, 5, 12, 18, 28], default: 0 },
  hsnCode: { type: String },
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' }
}, { _id: false });

const shippingAddressSchema = new mongoose.Schema({
  name: { type: String },
  line1: { type: String },
  line2: { type: String },
  city: { type: String },
  state: { type: String },
  pincode: { type: String },
  phone: { type: String }
}, { _id: false });

const billingSchema = new mongoose.Schema({
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  shippingCharge: { type: Number, default: 0 },
  taxableAmount: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 }
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  method: { type: String, enum: ['COD', 'ONLINE', 'MANUAL'] },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  paidAt: { type: Date }
}, { _id: false });

const returnRequestSchema = new mongoose.Schema({
  requestedAt: { type: Date },
  reason:      { type: String },
  type:        { type: String, enum: ['return', 'replace'] },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed'],
    default: 'pending'
  },
  replacementProductId:   { type: String },
  replacementProductName: { type: String },
  adminNote:   { type: String },
  resolvedAt:  { type: Date }
}, { _id: false });

const shipmentSchema = new mongoose.Schema({
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  items: [{ type: String }],          // array of SKUs in this shipment
  courier: { type: String },
  trackingId: { type: String },
  status: {
    type: String,
    enum: ['pending', 'packed', 'dispatched', 'in_transit', 'delivered', 'returned'],
    default: 'pending'
  },
  etaDays: { type: Number },
  dispatchedAt: { type: Date },
  deliveredAt: { type: Date }
});

/* ── main schema ── */

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },   // SAG-YYYYMMDD-XXXX

    customer: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
      email: { type: String },
      phone: { type: String }
    },

    items: [orderItemSchema],
    shippingAddress: shippingAddressSchema,
    billing: billingSchema,

    taxType: { type: String, enum: ['intra', 'inter'] }, // intra=CGST+SGST, inter=IGST

    payment: paymentSchema,
    shipments: [shipmentSchema],

    status: {
      type: String,
      enum: ['placed', 'confirmed', 'packed', 'shipped', 'delivered', 'return_requested', 'returned', 'cancelled'],
      default: 'placed'
    },

    returnRequest: returnRequestSchema,

    invoiceUrl: { type: String },
    couponCode: { type: String },
    notes: { type: String }
  },
  { timestamps: true }
);

/* ── auto-generate orderNumber before first save ── */
orderSchema.pre('save', async function (next) {
  if (this.orderNumber) return next();

  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const count = await mongoose.model('Order').countDocuments();
  this.orderNumber = `SAG-${dateStr}-${String(count + 1).padStart(4, '0')}`;
  next();
});

orderSchema.index({ 'customer.userId': 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);

export default Order;
