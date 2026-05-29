import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import { calculateTax } from '../utils/taxCalculator.js';
import { generateInvoiceForOrder } from './paymentController.js';
import { sendOrderConfirmation, sendStatusUpdate, sendOrderStatusEmail } from '../utils/emailService.js';
import { buildTimelineEntry, calcEstimatedDelivery } from '../utils/orderTimeline.js';

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

    // Add initial timeline entry and estimated delivery
    order.timeline = [buildTimelineEntry('placed', '', 'system')];
    order.estimatedDelivery = calcEstimatedDelivery(new Date(), 5);
    await order.save();

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
   ADMIN — UPDATE ORDER STATUS (enhanced: tracking + timeline)
═══════════════════════════════════ */
export const updateOrderStatus = async (req, res) => {
  try {
    const { status, trackingId, courier, trackingUrl,
            location, note, expectedDelivery } = req.body;

    const validStatuses = [
      'placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery',
      'delivered', 'cancelled', 'return_requested', 'returned'
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const prevStatus = order.status;
    order.status = status;

    // Build and append timeline entry
    const entry = buildTimelineEntry(status, location || '', req.adminUser?.name || 'admin');
    if (note) entry.description = note;
    if (!order.timeline) order.timeline = [];
    order.timeline.push(entry);

    // Update shipment tracking if provided
    if (trackingId || courier) {
      if (!order.shipments || !order.shipments.length) order.shipments = [{}];
      const shipment = order.shipments[0];
      if (trackingId) shipment.trackingId = trackingId;
      if (courier)    shipment.courier    = courier;
      if (trackingUrl) shipment.trackingUrl = trackingUrl;
      if (expectedDelivery) {
        shipment.expectedDelivery = new Date(expectedDelivery);
        order.estimatedDelivery   = new Date(expectedDelivery);
      }
      if (status === 'shipped')           shipment.dispatchedAt = new Date();
      if (status === 'delivered')         shipment.deliveredAt  = new Date();
      shipment.status =
        status === 'shipped'          ? 'dispatched'      :
        status === 'out_for_delivery' ? 'out_for_delivery' :
        status === 'delivered'        ? 'delivered'       :
        shipment.status;
    }

    await order.save();

    // Email customer on status change
    if (order.customer?.email && prevStatus !== status) {
      sendOrderStatusEmail(order, status).catch((err) =>
        console.error('Status email error:', err.message)
      );
    }

    res.json({ success: true, data: order, message: `Status updated to ${status}` });
  } catch (err) {
    console.error('updateOrderStatus error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════
   CUSTOMER — GET ORDER TRACKING
═══════════════════════════════════ */
export const getOrderTracking = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      ...(req.user ? { 'customer.userId': req.user._id } : {})
    })
    .select('orderNumber status timeline shipments estimatedDelivery createdAt customer billing items')
    .lean();

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
export const initiateReturn = async (req, res) => {
  try {
    const { returnType, reason, replacementProductId, replacementProductName } = req.body;

    const order = await Order.findOne({ _id: req.params.id, 'customer.userId': req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const delivered = ['delivered', 'DELIVERED'].includes(order.status);
    if (!delivered) {
      return res.status(400).json({ success: false, message: 'Order must be delivered before requesting return or replacement' });
    }

    if (order.returnRequest?.status === 'pending') {
      return res.status(400).json({ success: false, message: 'A return request is already pending for this order' });
    }

    order.returnRequest = {
      requestedAt: new Date(),
      reason: reason || '',
      type: returnType || 'return',
      status: 'pending',
      replacementProductId: replacementProductId || '',
      replacementProductName: replacementProductName || ''
    };
    order.status = 'return_requested';
    await order.save();

    console.log(`Return request: Order ${order.orderNumber} | Type: ${returnType} | Reason: ${reason}`);

    res.json({
      success: true,
      message: returnType === 'replace'
        ? 'Replacement request submitted. Our team will contact you within 24 hours.'
        : 'Return request submitted. Our team will contact you within 24 hours.',
      data: { orderNumber: order.orderNumber, returnType, status: 'pending' }
    });
  } catch (err) {
    console.error('initiateReturn error:', err);
    res.status(500).json({ success: false, message: err.message });
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
   ADMIN — PROCESS RETURN (legacy admin-initiated)
═══════════════════════════════════ */
export const adminInitiateReturn = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Reason required' });

    const existing = await Order.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Order not found' });

    const newNotes = `Return initiated: ${reason}${existing.notes ? ` | ${existing.notes}` : ''}`;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: 'returned', notes: newNotes },
      { new: true }
    );

    res.json({ success: true, data: order });
  } catch (err) {
    console.error('adminInitiateReturn:', err);
    res.status(500).json({ success: false, message: 'Return initiation failed' });
  }
};

/* ═══════════════════════════════════
   ADMIN — GET PENDING RETURN REQUESTS
═══════════════════════════════════ */
export const getPendingReturns = async (req, res) => {
  try {
    const returns = await Order.find({ 'returnRequest.status': 'pending' })
      .sort({ 'returnRequest.requestedAt': -1 })
      .lean();
    res.json({ success: true, data: returns, total: returns.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════
   ADMIN — APPROVE / REJECT RETURN
═══════════════════════════════════ */
export const actionReturn = async (req, res) => {
  try {
    const { action, adminNote } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be approved or rejected' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.returnRequest.status    = action;
    order.returnRequest.adminNote = adminNote || '';
    order.returnRequest.resolvedAt = new Date();
    order.status = action === 'approved' ? 'returned' : 'delivered';
    await order.save();

    res.json({ success: true, message: `Return request ${action}`, data: order });
  } catch (err) {
    console.error('actionReturn:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
