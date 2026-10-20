import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import PendingCheckout from '../models/PendingCheckout.js';
import { computeOrderTotals } from './orderCalculator.js';
import { buildTimelineEntry, calcEstimatedDelivery } from './orderTimeline.js';

// Safety net for "customer paid but no order exists".
//
// The browser creates the order after payment. If it can't (tab closed, network
// drop), the money is captured and nothing records the sale. This job looks at
// checkouts that are older than MIN_AGE_MS (so it never races the browser),
// asks Razorpay whether the payment was captured, and — only if no order exists
// for that payment — creates the order from the snapshot saved at create-order
// time. It NEVER refunds or moves money: if it can't fulfil (stock gone, amount
// mismatch) it flags the record `needs_review` and logs loudly for a human.
//
// Off by default: enabled with PAYMENT_RECONCILER=on (see server.js).

export const MIN_AGE_MS = 5 * 60 * 1000;   // give the browser a fair chance first
export const MAX_AGE_MS = 48 * 3600 * 1000; // stop looking after two days
const BATCH = 20;

const realDeps = () => ({
  PendingCheckout, Order, User, Product, mongoose, computeOrderTotals,
  buildTimelineEntry, calcEstimatedDelivery,
  getRazorpay: async () => (await import('../controllers/paymentController.js')).getRazorpayInstance(),
  withRetry: async (fn) => (await import('../controllers/orderController.js')).withOrderNumberRetry(fn),
  afterOrder: async (order) => {
    const { generateInvoiceForOrder } = await import('../controllers/paymentController.js');
    const { sendOrderConfirmation } = await import('./emailService.js');
    const invoiceUrl = await generateInvoiceForOrder(order);
    await sendOrderConfirmation({ ...order.toObject(), invoiceUrl });
  },
  log: console
});

async function resolveUser(p, d) {
  if (p.userId) return d.User.findById(p.userId);
  const email = String(p.contact?.email || '').toLowerCase().trim();
  const phone = String(p.contact?.phone || '').trim();
  if (!email || !phone) return null;
  let user = await d.User.findOne({ $or: [{ email }, { phone }] });
  if (!user) {
    try {
      user = await d.User.create({ name: p.contact?.name || 'Guest', email, phone });
    } catch (e) {
      if (e?.code === 11000) user = await d.User.findOne({ $or: [{ email }, { phone }] });
      else throw e;
    }
  }
  return user;
}

// Handles ONE pending checkout. Returns a short status string (used by tests/logs).
export async function reconcileOne(p, deps = realDeps()) {
  const d = deps;
  const flag = async (status, reason, extra = {}) => {
    await d.PendingCheckout.updateOne({ _id: p._id }, { $set: { status, reviewReason: reason, lastCheckedAt: new Date(), ...extra } });
    return status;
  };

  // 1. An order already exists for this Razorpay order → nothing to do.
  const existing = await d.Order.findOne({ 'payment.razorpayOrderId': p.razorpayOrderId }).select('orderNumber');
  if (existing) return flag('order_created', undefined, { orderNumber: existing.orderNumber });

  // 2. Ask Razorpay what really happened.
  const razorpay = await d.getRazorpay();
  const list = await razorpay.orders.fetchPayments(p.razorpayOrderId);
  const captured = (list?.items || []).find((x) => x.status === 'captured');
  if (!captured) return flag('unpaid');

  // A payment id can back at most one order (also enforced by a unique index).
  const used = await d.Order.findOne({ 'payment.razorpayPaymentId': captured.id }).select('orderNumber');
  if (used) return flag('order_created', undefined, { orderNumber: used.orderNumber });

  // 3. Rebuild the order from trusted server-side data.
  let totals;
  try {
    totals = await d.computeOrderTotals(
      p.items.map((i) => ({ productId: i.productId, qty: i.qty, size: i.size, colour: i.colour, storeId: i.storeId, sku: i.sku })),
      p.shippingAddress || {}
    );
  } catch (e) {
    d.log.error('PAYMENT RECONCILER: paid but cannot rebuild order —', { razorpayOrderId: p.razorpayOrderId, paymentId: captured.id, reason: e.message });
    return flag('needs_review', `Cannot rebuild order: ${e.message}`);
  }
  const { enrichedItems, billing, taxType } = totals;
  if (captured.amount !== Math.round(billing.grandTotal * 100)) {
    d.log.error('PAYMENT RECONCILER: amount mismatch —', { razorpayOrderId: p.razorpayOrderId, paymentId: captured.id, capturedPaise: captured.amount, expectedPaise: Math.round(billing.grandTotal * 100) });
    return flag('needs_review', 'Captured amount differs from current cart total');
  }

  const orderUser = await resolveUser(p, d);
  if (!orderUser) return flag('needs_review', 'No customer contact details to attach the order to');

  // 4. Create it, reserve stock — same rules as the browser path.
  const session = await d.mongoose.startSession();
  let order;
  try {
    await d.withRetry(() => session.withTransaction(async () => {
      const created = await d.Order.create([{
        customer: { userId: orderUser._id, name: orderUser.name, email: orderUser.email, phone: orderUser.phone },
        items: enrichedItems,
        shippingAddress: p.shippingAddress,
        billing,
        taxType,
        payment: { method: 'ONLINE', razorpayOrderId: p.razorpayOrderId, razorpayPaymentId: captured.id, status: 'paid', paidAt: new Date() },
        status: 'confirmed',
        notes: [p.notes, 'Created automatically by payment reconciler'].filter(Boolean).join(' | ')
      }], { session });
      order = created[0];

      for (const item of enrichedItems) {
        const isPlain = !item.size && !item.colour;
        const reserved = isPlain
          ? await d.Product.updateOne({ _id: item.productId, stock: { $gte: item.qty } }, { $inc: { stock: -item.qty } }, { session })
          : await d.Product.updateOne({ _id: item.productId, variants: { $elemMatch: { size: item.size, colour: item.colour, stock: { $gte: item.qty } } } }, { $inc: { 'variants.$.stock': -item.qty } }, { session });
        if (!reserved.modifiedCount) throw Object.assign(new Error('Stock no longer available'), { statusCode: 409 });
      }
      order.timeline = [d.buildTimelineEntry('confirmed', '', 'system')];
      order.estimatedDelivery = d.calcEstimatedDelivery(new Date(), 5);
      await order.save({ session });
    }));
  } catch (e) {
    if (e?.code === 11000 && /razorpayPaymentId/.test(`${JSON.stringify(e.keyPattern || {})}${e.message || ''}`)) {
      return flag('order_created'); // browser got there first
    }
    d.log.error('PAYMENT RECONCILER: paid but order creation failed —', { razorpayOrderId: p.razorpayOrderId, paymentId: captured.id, reason: e.message });
    return flag('needs_review', `Order creation failed: ${e.message}`);
  } finally {
    session.endSession();
  }

  await d.PendingCheckout.updateOne({ _id: p._id }, { $set: { status: 'order_created', orderNumber: order.orderNumber, lastCheckedAt: new Date() } });
  d.log.warn('PAYMENT RECONCILER: created missing order', { orderNumber: order.orderNumber, razorpayOrderId: p.razorpayOrderId });
  d.afterOrder(order).catch((err) => d.log.error('reconciler post-order email/invoice failed:', err.message));
  return 'created';
}

let running = false;
export async function runReconciler(deps = realDeps()) {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    const pending = await deps.PendingCheckout.find({
      status: 'created',
      createdAt: { $lte: new Date(now - MIN_AGE_MS), $gte: new Date(now - MAX_AGE_MS) }
    }).sort({ createdAt: 1 }).limit(BATCH);
    for (const p of pending) {
      try { await reconcileOne(p, deps); }
      catch (e) { deps.log.error('PAYMENT RECONCILER error for', p.razorpayOrderId, e.message); }
    }
  } finally {
    running = false;
  }
}

export function startPaymentReconciler(intervalMs = 2 * 60 * 1000) {
  if (process.env.PAYMENT_RECONCILER !== 'on') return null;
  console.log('Payment reconciler enabled');
  const t = setInterval(() => runReconciler().catch((e) => console.error('reconciler tick failed:', e.message)), intervalMs);
  t.unref?.();
  return t;
}
