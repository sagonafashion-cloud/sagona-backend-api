import Order from '../models/Order.js';
import Store from '../models/Store.js';
import { generateInvoice } from '../utils/invoiceGenerator.js';

// Order numbers look like SAG-20260920-0014 — validate the shape before
// hitting the DB so this public route can't be used as an open query probe.
const ORDER_NUMBER_RE = /^SAG-\d{8}-\d{4,}$/;

/* ═══════════════════════════════════════════════════════════
   GET /api/invoices/:orderNumber
   Public, scoped strictly to one order's invoice by its order number —
   same trust boundary the emailed order-confirmation link already relies
   on (order numbers aren't guessable/sequenced from outside). No login
   session required, since the recipient reading the confirmation email
   never has one.

   Root cause this route fixes: Cloudinary blocks public delivery of raw
   PDF/ZIP resources by default (account-level security setting), so the
   previous "Download Invoice" link — a direct Cloudinary CDN URL — failed
   for every order, regardless of auth. This route sidesteps that
   entirely by regenerating the PDF from the order's own stored data (the
   same invoiceGenerator.js used for the Cloudinary/archival copy) and
   streaming it directly from our own server instead of proxying through
   Cloudinary's restricted delivery.
═══════════════════════════════════════════════════════════ */
export const downloadInvoice = async (req, res) => {
  try {
    const { orderNumber } = req.params;

    if (!ORDER_NUMBER_RE.test(orderNumber || '')) {
      return res.status(400).json({ success: false, message: 'Invalid order number' });
    }

    const order = await Order.findOne({ orderNumber }).lean();
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    let store = null;
    const firstStoreId = order.items?.[0]?.storeId;
    if (firstStoreId) store = await Store.findById(firstStoreId).lean();

    const buffer = await generateInvoice(order, store);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice_${orderNumber}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    // Do NOT swallow this — a failure here must be visible in logs, not a
    // silent/blank response (this is exactly the bug class we're fixing).
    console.error('downloadInvoice failed for', req.params.orderNumber, ':', err);
    res.status(500).json({ success: false, message: 'Could not generate invoice' });
  }
};
