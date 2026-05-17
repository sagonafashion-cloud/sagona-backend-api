import nodemailer from 'nodemailer';
import {
  orderConfirmationTemplate,
  statusUpdateTemplate,
  welcomeTemplate,
  passwordResetTemplate,
  restockAlertTemplate
} from './emailTemplates.js';

/* ── transport factory (lazy — only created when sending) ── */
const createTransport = () =>
  nodemailer.createTransport({
    host:   process.env.EMAIL_HOST   || 'smtp.gmail.com',
    port:   Number(process.env.EMAIL_PORT) || 587,
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

const FROM = () => process.env.EMAIL_FROM || '"SAGONA" <noreply@sagona.in>';

/* ── core send function ── */
export const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[email] EMAIL_USER / EMAIL_PASS not configured — skipping send');
    return;
  }

  try {
    const transporter = createTransport();
    const info = await transporter.sendMail({ from: FROM(), to, subject, html });
    console.log(`[email] Sent "${subject}" to ${to} (${info.messageId})`);
    return info;
  } catch (err) {
    console.error(`[email] Failed to send "${subject}" to ${to}:`, err.message);
    throw err;
  }
};

/* ── OTP store (in-memory, 15-min TTL) ── */
const _otpStore = new Map();

export const storeOtp = (email, otp) => {
  _otpStore.set(email.toLowerCase(), { otp, expiry: Date.now() + 15 * 60 * 1000 });
};

export const verifyOtp = (email, otp) => {
  const entry = _otpStore.get(email.toLowerCase());
  if (!entry) return false;
  if (Date.now() > entry.expiry) { _otpStore.delete(email.toLowerCase()); return false; }
  if (String(entry.otp) !== String(otp)) return false;
  _otpStore.delete(email.toLowerCase()); // single-use
  return true;
};

/* ── domain-specific senders ── */

export const sendOrderConfirmation = async (order) => {
  if (!order?.customer?.email) return;
  await sendEmail({
    to:      order.customer.email,
    subject: `Order Confirmed — ${order.orderNumber} | SAGONA`,
    html:    orderConfirmationTemplate(order)
  });
};

export const sendStatusUpdate = async (order) => {
  if (!order?.customer?.email) return;
  const labels = {
    confirmed: 'Confirmed', packed: 'Packed', shipped: 'Shipped',
    delivered: 'Delivered', returned: 'Return Initiated', cancelled: 'Cancelled'
  };
  const label = labels[order.status] || order.status;
  await sendEmail({
    to:      order.customer.email,
    subject: `Order ${label} — ${order.orderNumber} | SAGONA`,
    html:    statusUpdateTemplate(order)
  });
};

export const sendWelcome = async (user) => {
  if (!user?.email) return;
  await sendEmail({
    to:      user.email,
    subject: 'Welcome to SAGONA',
    html:    welcomeTemplate(user)
  });
};

export const sendPasswordReset = async (user, otp) => {
  if (!user?.email) return;
  await sendEmail({
    to:      user.email,
    subject: 'Your SAGONA Password Reset OTP',
    html:    passwordResetTemplate(user, otp)
  });
};

export const sendRestockAlert = async (user, product) => {
  if (!user?.email) return;
  await sendEmail({
    to:      user.email,
    subject: `Back in Stock: ${product.name} | SAGONA`,
    html:    restockAlertTemplate(user, product)
  });
};
