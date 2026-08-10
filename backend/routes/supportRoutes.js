import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { sendEmail } from '../utils/emailService.js';
import { contactLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const contactRules = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('message').trim().isLength({ min: 10, max: 2000 }).withMessage('Message must be 10–2000 characters'),
];

router.post('/contact', contactLimiter, contactRules, validate, async (req, res) => {
  try {
    const { name, email, orderNumber, subject, message } = req.body;
    const supportEmail = process.env.SUPPORT_EMAIL || 'care@sagona.in';

    await sendEmail({
      to:      supportEmail,
      subject: `[Support] ${(subject || 'Query').replace(/[\r\n]/g, ' ').slice(0, 120)} from ${name.replace(/[\r\n]/g, ' ').slice(0, 100)}`,
      html: `
        <h3>New support request from sagona.in</h3>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        ${orderNumber ? `<p><strong>Order:</strong> ${escapeHtml(orderNumber)}</p>` : ''}
        ${subject ? `<p><strong>Topic:</strong> ${escapeHtml(subject)}</p>` : ''}
        <p><strong>Message:</strong></p>
        <p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
      `
    });

    // Auto-reply to customer
    sendEmail({
      to:      email,
      subject: 'We got your message — SAGONA Support',
      html: `
        <p>Hi ${escapeHtml(name)},</p>
        <p>Thank you for reaching out. We've received your message and will reply within 24 hours.</p>
        <p>Your query: <em>${escapeHtml(message.substring(0, 120))}${message.length > 120 ? '…' : ''}</em></p>
        <p>If urgent, WhatsApp us at +91-XXXXXXXXXX.</p>
        <p>— The Sagona Team</p>
      `
    }).catch(() => {});

    res.json({ success: true, message: 'Message received' });
  } catch (err) {
    console.error('support/contact:', err);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

export default router;
