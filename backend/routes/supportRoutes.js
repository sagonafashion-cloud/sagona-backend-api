import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { sendEmail } from '../utils/emailService.js';
import { contactLimiter, contactIpLimiter } from '../middleware/rateLimiters.js';
import { classify, makeToken, makeReplyLimiter } from '../utils/spamGuard.js';

const router = express.Router();
const replyLimiter = makeReplyLimiter();
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const contactRules = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('message').trim().isLength({ min: 10, max: 2000 }).withMessage('Message must be 10–2000 characters'),
];

// The form asks for a token when it loads; a real visitor needs a few seconds to fill the form,
// a bot posting straight to the API has no token.
router.get('/token', contactIpLimiter, (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ success: true, token: makeToken() });
});

router.post('/contact', contactIpLimiter, contactLimiter, contactRules, validate, async (req, res) => {
  try {
    const { name, email, orderNumber, subject, message } = req.body;
    const supportEmail = process.env.SUPPORT_EMAIL || 'care@sagona.in';

    const verdict = classify({ body: req.body });
    if (verdict.action === 'drop') {
      // Look successful so bots get no signal to adapt to; nothing is sent to anyone.
      console.warn('[support] spam dropped:', verdict.reasons.join(','));
      return res.json({ success: true, message: 'Message received' });
    }
    const review = verdict.action === 'review';

    await sendEmail({
      to:      supportEmail,
      subject: `[Support]${review ? '[Review]' : ''} ${(subject || 'Query').replace(/[\r\n]/g, ' ').slice(0, 120)} from ${name.replace(/[\r\n]/g, ' ').slice(0, 100)}`,
      html: `
        <h3>New support request from sagona.in</h3>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        ${orderNumber ? `<p><strong>Order:</strong> ${escapeHtml(orderNumber)}</p>` : ''}
        ${subject ? `<p><strong>Topic:</strong> ${escapeHtml(subject)}</p>` : ''}
        ${review ? `<p style="color:#b45309"><strong>Held for review (${escapeHtml(verdict.reasons.join(', '))}):</strong> no automatic reply was sent.</p>` : ''}
        <p><strong>Message:</strong></p>
        <p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
      `
    });

    // Auto-reply to customer: only for messages that passed every check, one per address per day.
    if (!review && replyLimiter.allow(email)) sendEmail({
      to:      email,
      subject: 'We got your message — SAGONA Support',
      html: `
        <p>Hi ${escapeHtml(name)},</p>
        <p>Thank you for reaching out. We've received your message and will reply within 24 hours.</p>
        <p>Your query: <em>${escapeHtml(message.substring(0, 120))}${message.length > 120 ? '…' : ''}</em></p>
        <p>If urgent, WhatsApp us at +91 90996 90446.</p>
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
