import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order.js';
import Store from '../models/Store.js';
import { generateAndUploadInvoice } from '../utils/invoiceGenerator.js';
import { sendOrderConfirmation } from '../utils/emailService.js';
import { computeOrderTotals } from '../utils/orderCalculator.js';

/* ── helpers ── */
export const getRazorpayInstance = () => {
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay not configured');
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

// Timing-safe hex string comparison — never use === on secrets/signatures.
export function safeCompareHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* ═══════════════════════════════════
   CREATE RAZORPAY ORDER
   Amount is ALWAYS recomputed server-side from the cart's real product
   prices — the client cannot influence how much the Razorpay order is for.
═══════════════════════════════════ */
export const createRazorpayOrder = async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;

    const { billing } = await computeOrderTotals(items, shippingAddress);
    const amountInPaise = Math.round(billing.grandTotal * 100);

    if (amountInPaise < 100) {
      return res.status(400).json({ success: false, message: 'Order amount too small' });
    }

    const razorpay = getRazorpayInstance();

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `sagona_${Date.now()}`,
      notes: { userId: String(req.user._id) }
    });

    res.json({ success: true, data: order });
  } catch (err) {
    console.error('createRazorpayOrder:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.statusCode ? err.message : 'Unable to create payment order' });
  }
};

/* ── invoice helper (shared) ── */
export async function generateInvoiceForOrder(order) {
  let store = null;
  const firstStoreId = order.items?.[0]?.storeId;
  if (firstStoreId) store = await Store.findById(firstStoreId).lean();

  const url = await generateAndUploadInvoice(order, store);
  await Order.findByIdAndUpdate(order._id, { invoiceUrl: url });
  return url;
}

/* ═══════════════════════════════════
   GET PUBLIC KEY
═══════════════════════════════════ */
export const getRazorpayKey = (_req, res) => {
  if (!process.env.RAZORPAY_KEY_ID) {
    return res.status(500).json({ success: false, message: 'Razorpay not configured' });
  }
  res.json({ success: true, data: { keyId: process.env.RAZORPAY_KEY_ID } });
};

/* ═══════════════════════════════════
   VERIFY PAYMENT
═══════════════════════════════════ */
export const verifyPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ success: false, message: 'Payment details required' });
    }

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (!safeCompareHex(expected, razorpaySignature)) {
      console.warn('PAYMENT SIGNATURE MISMATCH:', { ip: req.ip, razorpayOrderId, razorpayPaymentId });
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    if (orderId) {
      // Ownership check — the order must belong to the requesting user.
      const existing = await Order.findOne({ _id: orderId, 'customer.userId': req.user?._id });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      // Idempotency — don't reprocess an already-paid order.
      if (existing.payment?.status === 'paid') {
        return res.json({ success: true, message: 'Already verified' });
      }

      const order = await Order.findByIdAndUpdate(orderId, {
        'payment.razorpayOrderId': razorpayOrderId,
        'payment.razorpayPaymentId': razorpayPaymentId,
        'payment.status': 'paid',
        'payment.paidAt': new Date(),
        status: 'confirmed'
      }, { new: true });

      // Generate invoice PDF, then send confirmation (non-blocking)
      if (order) {
        generateInvoiceForOrder(order)
          .then((invoiceUrl) => {
            const orderWithInvoice = { ...order.toObject(), invoiceUrl };
            sendOrderConfirmation(orderWithInvoice).catch((err) =>
              console.error('sendOrderConfirmation failed:', err.message)
            );
          })
          .catch((err) => console.error('Invoice generation failed:', err.message));
      }
    }

    res.json({ success: true, message: 'Payment verified' });
  } catch (err) {
    console.error('verifyPayment:', err);
    res.status(500).json({ success: false, message: 'Payment verification error' });
  }
};

/* ═══════════════════════════════════
   RAZORPAY WEBHOOK
═══════════════════════════════════ */
export const razorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(500).json({ success: false, message: 'Webhook not configured' });
    }

    const signature = req.headers['x-razorpay-signature'];
    // req.body is a raw Buffer here (mounted with express.raw() ahead of express.json()
    // in server.js) — the HMAC must be computed over the exact raw bytes Razorpay signed,
    // not a re-serialised object, or every legitimate webhook call fails verification.
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);

    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (!safeCompareHex(expected, signature)) {
      console.warn('WEBHOOK SIGNATURE MISMATCH:', { ip: req.ip });
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const { event, payload } = JSON.parse(rawBody);

    if (event === 'payment.captured') {
      const rzpOrderId = payload?.payment?.entity?.order_id;
      const capturedAmountPaise = payload?.payment?.entity?.amount;
      if (rzpOrderId) {
        const order = await Order.findOne({ 'payment.razorpayOrderId': rzpOrderId });
        // Idempotency + amount cross-check — never mark paid on amount mismatch or twice.
        if (order && order.payment?.status !== 'paid') {
          const expectedPaise = Math.round(order.billing.grandTotal * 100);
          if (capturedAmountPaise === expectedPaise) {
            order.payment.status = 'paid';
            order.payment.paidAt = new Date();
            order.status = 'confirmed';
            await order.save();
          } else {
            console.error('WEBHOOK AMOUNT MISMATCH:', { orderId: order._id, expectedPaise, capturedAmountPaise });
          }
        }
      }
    }

    if (event === 'payment.failed') {
      const rzpOrderId = payload?.payment?.entity?.order_id;
      if (rzpOrderId) {
        await Order.findOneAndUpdate(
          { 'payment.razorpayOrderId': rzpOrderId },
          { 'payment.status': 'failed' }
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('razorpayWebhook:', err);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
};
