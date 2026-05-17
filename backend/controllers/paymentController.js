import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order.js';
import Store from '../models/Store.js';
import { generateAndUploadInvoice } from '../utils/invoiceGenerator.js';
import { sendOrderConfirmation } from '../utils/emailService.js';

/* ── helpers ── */
const getRazorpayInstance = () => {
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay not configured');
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

/* ═══════════════════════════════════
   CREATE RAZORPAY ORDER
═══════════════════════════════════ */
export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }

    const razorpay = getRazorpayInstance();

    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt: receipt || `sagona_${Date.now()}`
    });

    res.json({ success: true, data: order });
  } catch (err) {
    console.error('createRazorpayOrder:', err);
    res.status(500).json({ success: false, message: 'Unable to create payment order' });
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

    if (expected !== razorpaySignature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    if (orderId) {
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
    const body      = JSON.stringify(req.body);

    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    if (expected !== signature) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const { event, payload } = req.body;

    if (event === 'payment.captured') {
      const rzpOrderId = payload?.payment?.entity?.order_id;
      if (rzpOrderId) {
        await Order.findOneAndUpdate(
          { 'payment.razorpayOrderId': rzpOrderId },
          { 'payment.status': 'paid', 'payment.paidAt': new Date(), status: 'confirmed' }
        );
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
