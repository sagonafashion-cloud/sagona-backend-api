import mongoose from 'mongoose';

// A snapshot of what the shopper was paying for, written when the Razorpay
// order is created (BEFORE they pay). If money is captured but the browser
// never manages to create the order (tab closed, network drop, crash), the
// reconciler uses this record to create the order from the server side.
const pendingCheckoutSchema = new mongoose.Schema(
  {
    razorpayOrderId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // absent for guests
    items: [{
      _id: false,
      productId: String,
      qty: Number,
      size: String,
      colour: String,
      storeId: String,
      sku: String
    }],
    shippingAddress: { type: mongoose.Schema.Types.Mixed },
    contact: { name: String, email: String, phone: String }, // guest contact details
    notes: String,
    expectedPaise: { type: Number },
    // created        — waiting for the browser to place the order
    // order_created  — an Order exists for this payment (by browser or reconciler)
    // unpaid         — checked with Razorpay, no captured payment (abandoned)
    // needs_review   — payment captured but order could not be created (stock gone,
    //                  amount mismatch…); a human must refund or fulfil
    status: {
      type: String,
      enum: ['created', 'order_created', 'unpaid', 'needs_review'],
      default: 'created'
    },
    orderNumber: String,
    reviewReason: String,
    lastCheckedAt: Date
  },
  { timestamps: true }
);

pendingCheckoutSchema.index({ status: 1, createdAt: 1 });
// Housekeeping: drop records after 60 days.
pendingCheckoutSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 });

export default mongoose.model('PendingCheckout', pendingCheckoutSchema);
