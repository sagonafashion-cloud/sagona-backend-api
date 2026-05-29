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

export const sendOrderStatusEmail = async (order, newStatus) => {
  if (!order?.customer?.email) return;

  const shipment = order.shipments?.[0];
  const statusMessages = {
    confirmed:        { subject: 'Order Confirmed',          headline: 'Great news! Your order is confirmed.',        color: '#1D9E75' },
    packed:           { subject: 'Order Packed',             headline: 'Your order has been packed and is ready to ship.', color: '#C9A84C' },
    shipped:          { subject: 'Your Order is on the Way!', headline: 'Your order has been shipped.',               color: '#C9A84C' },
    out_for_delivery: { subject: 'Out for Delivery Today!',  headline: 'Your order is out for delivery.',             color: '#EF9F27' },
    delivered:        { subject: 'Order Delivered',          headline: 'Your order has been delivered. Enjoy!',        color: '#1D9E75' },
    cancelled:        { subject: 'Order Cancelled',          headline: 'Your order has been cancelled.',              color: '#E24B4A' },
    return_requested: { subject: 'Return Request Received',  headline: 'We have received your return request.',       color: '#EF9F27' },
  };

  const config = statusMessages[newStatus?.toLowerCase()];
  if (!config) return;

  const trackingSection = shipment?.trackingId ? `
    <div style="background:#F8F6F3;border-radius:6px;padding:16px;margin:20px 0">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.1em;color:#888;margin-bottom:8px">TRACKING DETAILS</div>
      <div style="font-size:14px;font-weight:500">${shipment.courier || 'Courier'}</div>
      <div style="font-size:13px;color:#555;margin-top:4px">AWB: ${shipment.trackingId}</div>
      ${shipment.trackingUrl
        ? `<a href="${shipment.trackingUrl}" style="display:inline-block;margin-top:12px;padding:8px 18px;background:#0A0A0A;color:#fff;text-decoration:none;font-size:12px;letter-spacing:0.08em;border-radius:3px">TRACK SHIPMENT</a>`
        : ''
      }
    </div>` : '';

  const estDelivery = order.estimatedDelivery
    ? new Date(order.estimatedDelivery).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;

  await sendEmail({
    to:      order.customer.email,
    subject: `${config.subject} — ${order.orderNumber} | SAGONA`,
    html: `
      <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#0A0A0A">
        <div style="text-align:center;padding:32px 0 24px">
          <div style="font-family:Georgia,serif;font-size:28px;letter-spacing:0.2em">SAGONA</div>
        </div>
        <div style="background:${config.color};height:3px;border-radius:99px;margin-bottom:28px"></div>
        <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:500;margin-bottom:8px">${config.headline}</h2>
        <p style="color:#555;font-size:14px;margin-bottom:4px">Hi ${order.customer.name || 'there'},</p>
        <p style="color:#555;font-size:14px;margin-bottom:20px">
          Your order <strong>${order.orderNumber}</strong> has been updated.
        </p>
        ${trackingSection}
        ${estDelivery && !['delivered', 'cancelled'].includes(newStatus) ? `
          <div style="background:#EAF3DE;border-radius:6px;padding:14px 16px;margin-bottom:20px">
            <div style="font-size:13px;color:#1D9E75;font-weight:500">&#128338; Estimated Delivery: ${estDelivery}</div>
          </div>` : ''
        }
        <a href="https://sagona.in/account.html"
           style="display:inline-block;background:#C9A84C;color:#fff;padding:12px 28px;
                  text-decoration:none;border-radius:4px;font-size:13px;letter-spacing:0.08em">
          VIEW ORDER
        </a>
        <hr style="border:none;border-top:0.5px solid #E8E5E0;margin:28px 0">
        <p style="font-size:12px;color:#999;text-align:center">
          © 2026 Sagona · <a href="https://sagona.in/support.html" style="color:#999">Help</a>
        </p>
      </div>
    `
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
