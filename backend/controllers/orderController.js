import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import { calculateTax } from '../utils/taxCalculator.js';
import { generateInvoiceForOrder } from './paymentController.js';
import { sendOrderConfirmation, sendStatusUpdate } from '../utils/emailService.js';

/* ═══════════════════════════════════
   CREATE ORDER (customer)
═══════════════════════════════════ */
export const createOrder = async (req, res) => {
  try {
    const {
      items = [],
      shippingAddress,
      payment,
      couponCode,
      notes
    } = req.body;

    if (!items.length) {
      return res.status(400).json({ success: false, message: 'Order items required' });
    }

    let subtotal = 0;
    const enrichedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({ success: false, message: `Product ${item.productId} not found` });
      }

      const unitPrice = product.price;
      const qty = Number(item.qty || item.quantity || 1);
      subtotal += unitPrice * qty;

      enrichedItems.push({
        productId: product._id,
        name: product.name,
        sku: item.sku || product.sku,
        colour: item.colour,
        size: item.size,
        qty,
        unitPrice,
        mrp: product.mrp || unitPrice,
        gstSlab: product.gstSlab || 0,
        hsnCode: product.hsnCode,
        storeId: item.storeId
      });
    }

    const shippingCharge = subtotal >= (Number(process.env.FREE_SHIPPING_THRESHOLD) || 999) ? 0 : 99;

    // GST calculation
    const storeState    = enrichedItems[0]?.storeState || '';
    const customerState = shippingAddress?.state || '';
    const tax = calculateTax(enrichedItems, storeState, customerState);

    const billing = {
      subtotal:      tax.subtotal,
      shippingCharge,
      taxableAmount: tax.taxableAmount,
      cgst:          tax.cgst,
      sgst:          tax.sgst,
      igst:          tax.igst,
      grandTotal:    tax.grandTotal + shippingCharge
    };

    const paymentMethod = payment?.method || 'COD';
    const order = await Order.create({
      customer: {
        userId: req.user._id,
        name:   req.user.name,
        email:  req.user.email,
        phone:  req.user.phone
      },
      items: enrichedItems,
      shippingAddress,
      billing,
      taxType: tax.taxType,
      payment: payment || { method: 'COD', status: 'pending' },
      couponCode,
      notes
    });

    // Loyalty: 1 point per ₹100
    const loyaltyEarned = Math.floor(billing.grandTotal / 100);
    await User.findByIdAndUpdate(req.user._id, { $inc: { loyaltyPoints: loyaltyEarned } });

    // COD: generate invoice + send confirmation (non-blocking)
    if (paymentMethod === 'COD') {
      generateInvoiceForOrder(order)
        .then((invoiceUrl) => {
          const orderWithInvoice = { ...order.toObject(), invoiceUrl };
          sendOrderConfirmation(orderWithInvoice).catch((err) =>
            console.error('sendOrderConfirmation failed:', err.message)
          );
        })
        .catch((err) => console.error('COD invoice generation failed:', err.message));
    }

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    console.error('createOrder:', err);
    res.status(500).json({ success: false, message: 'Create order failed' });
  }
};

/* ═══════════════════════════════════
   GET MY ORDERS (customer)
═══════════════════════════════════ */
export const getMyOrders = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Order.find({ 'customer.userId': req.user._id })
        .sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments({ 'customer.userId': req.user._id })
    ]);

    res.json({ success: true, data, total, page, limit });
  } catch (err) {
    console.error('getMyOrders:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
};

/* ═══════════════════════════════════
   GET SINGLE ORDER
═══════════════════════════════════ */
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.productId', 'name images image')
      .populate('items.storeId', 'name city')
      .populate('shipments.storeId', 'name city');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Customers can only see their own orders
    if (req.user && order.customer.userId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    res.json({ success: true, data: order });
  } catch {
    res.status(400).json({ success: false, message: 'Invalid order id' });
  }
};

/* ═══════════════════════════════════
   ADMIN — GET ALL ORDERS
═══════════════════════════════════ */
export const getOrders = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.status)  filter.status = { $regex: new RegExp(`^${req.query.status}$`, 'i') };
    if (req.query.storeId) filter['items.storeId'] = req.query.storeId;
    if (req.query.search) {
      filter.$or = [
        { orderNumber: { $regex: req.query.search, $options: 'i' } },
        { 'customer.name': { $regex: req.query.search, $options: 'i' } },
        { 'customer.email': { $regex: req.query.search, $options: 'i' } }
      ];
    }
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to)   filter.createdAt.$lte = new Date(req.query.to);
    }

    const [data, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments(filter)
    ]);

    res.json({ success: true, data, total, page, limit });
  } catch (err) {
    console.error('getOrders:', err);
    res.status(500).json({ success: false, message: 'Fetch orders failed' });
  }
};

/* ═══════════════════════════════════
   ADMIN — UPDATE ORDER STATUS
═══════════════════════════════════ */
export const updateOrder = async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ['placed', 'confirmed', 'packed', 'shipped', 'delivered', 'returned', 'cancelled'];
    // Legacy statuses for backward compatibility
    const legacyMap = { PENDING: 'placed', DELIVERED: 'delivered' };
    const normalised = legacyMap[status] || status;

    if (!validStatuses.includes(normalised)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findByIdAndUpdate(req.params.id, { status: normalised }, { new: true });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    sendStatusUpdate(order).catch((err) => console.error('sendStatusUpdate failed:', err.message));

    res.json({ success: true, data: order });
  } catch {
    res.status(400).json({ success: false, message: 'Update failed' });
  }
};

/* ═══════════════════════════════════
   CUSTOMER — CANCEL ORDER
═══════════════════════════════════ */
export const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, 'customer.userId': req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (!['placed', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage' });
    }

    order.status = 'cancelled';
    await order.save();
    sendStatusUpdate(order).catch(() => {});

    res.json({ success: true, message: 'Order cancelled successfully' });
  } catch (err) {
    console.error('cancelOrder:', err);
    res.status(500).json({ success: false, message: 'Cancel failed' });
  }
};

/* ═══════════════════════════════════
   CUSTOMER — RETURN / REPLACE REQUEST
═══════════════════════════════════ */
export const createReturnRequest = async (req, res) => {
  try {
    const { returnType, reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ success: false, message: 'Reason required' });

    const order = await Order.findOne({ _id: req.params.id, 'customer.userId': req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.status !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Only delivered orders can be returned or replaced' });
    }

    const note = `[${returnType?.toUpperCase() || 'RETURN'} REQUEST] ${reason} (submitted ${new Date().toISOString()})`;
    order.notes = order.notes ? `${note} | ${order.notes}` : note;
    await order.save();

    res.json({ success: true, message: `${returnType === 'replace' ? 'Replacement' : 'Return'} request submitted. We will contact you within 24 hours.` });
  } catch (err) {
    console.error('createReturnRequest:', err);
    res.status(500).json({ success: false, message: 'Request failed' });
  }
};

/* ═══════════════════════════════════
   ADMIN — CREATE MANUAL ORDER
═══════════════════════════════════ */
export const createManualOrder = async (req, res) => {
  try {
    const { customer, items, shippingAddress, billing, payment, notes } = req.body;

    if (!customer || !items?.length) {
      return res.status(400).json({ success: false, message: 'customer and items required' });
    }

    const order = await Order.create({
      customer,
      items,
      shippingAddress,
      billing,
      payment: payment || { method: 'MANUAL', status: 'paid', paidAt: new Date() },
      notes,
      status: 'confirmed'
    });

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    console.error('createManualOrder:', err);
    res.status(500).json({ success: false, message: 'Failed to create manual order' });
  }
};

/* ═══════════════════════════════════
   ADMIN — INITIATE RETURN
═══════════════════════════════════ */
export const initiateReturn = async (req, res) => {
  try {
    const { reason, items } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Reason required' });

    const existing = await Order.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Order not found' });

    const newNotes = `Return initiated: ${reason}${existing.notes ? ` | ${existing.notes}` : ''}`;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: 'returned', notes: newNotes },
      { new: true }
    );

    // TODO Phase 4: send return confirmation email

    res.json({ success: true, data: order });
  } catch (err) {
    console.error('initiateReturn:', err);
    res.status(500).json({ success: false, message: 'Return initiation failed' });
  }
};
