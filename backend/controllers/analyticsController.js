import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';

/* ── date helpers ── */
const parseDateRange = (query) => {
  const now = new Date();
  let from, to;

  if (query.from) {
    from = new Date(query.from);
  } else {
    const period = query.period || 'month';
    from = new Date(now);
    if (period === 'day')   from.setDate(now.getDate() - 1);
    if (period === 'week')  from.setDate(now.getDate() - 7);
    if (period === 'month') from.setMonth(now.getMonth() - 1);
    if (period === 'year')  from.setFullYear(now.getFullYear() - 1);
  }

  to = query.to ? new Date(query.to) : now;
  return { from, to };
};

const baseMatch = (from, to, storeId) => {
  const match = {
    createdAt: { $gte: from, $lte: to },
    status: { $nin: ['cancelled', 'returned'] }
  };
  if (storeId) match['items.storeId'] = storeId;
  return match;
};

/* ═══════════════════════════════════
   REVENUE
═══════════════════════════════════ */
export const getRevenue = async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const match = baseMatch(from, to, req.query.storeId);

    const data = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$billing.grandTotal' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', revenue: 1, orders: 1, _id: 0 } }
    ]);

    const total = data.reduce((s, d) => s + d.revenue, 0);
    res.json({ success: true, data, total, from, to });
  } catch (err) {
    console.error('getRevenue:', err);
    res.status(500).json({ success: false, message: 'Revenue query failed' });
  }
};

/* ═══════════════════════════════════
   ORDERS by groupBy
═══════════════════════════════════ */
export const getOrderAnalytics = async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const groupBy = req.query.groupBy || 'status';
    const match = { createdAt: { $gte: from, $lte: to } };

    const groupId = groupBy === 'status'   ? '$status'
                  : groupBy === 'store'    ? '$items.storeId'
                  : groupBy === 'category' ? '$items.sku'
                  : '$status';

    const pipeline = groupBy === 'store'
      ? [
          { $match: match },
          { $unwind: '$items' },
          { $group: { _id: '$items.storeId', count: { $sum: 1 }, revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.qty'] } } } },
          { $lookup: { from: 'stores', localField: '_id', foreignField: '_id', as: 'store' } },
          { $project: { store: { $arrayElemAt: ['$store.name', 0] }, count: 1, revenue: 1 } }
        ]
      : [
          { $match: match },
          { $group: { _id: groupId, count: { $sum: 1 } } },
          { $project: { label: '$_id', count: 1, _id: 0 } }
        ];

    const data = await Order.aggregate(pipeline);
    res.json({ success: true, data, from, to });
  } catch (err) {
    console.error('getOrderAnalytics:', err);
    res.status(500).json({ success: false, message: 'Order analytics query failed' });
  }
};

/* ═══════════════════════════════════
   TOP PRODUCTS
═══════════════════════════════════ */
export const getTopProducts = async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const sortBy = req.query.by === 'qty' ? 'qty' : 'revenue';

    const data = await Order.aggregate([
      { $match: baseMatch(from, to, req.query.storeId) },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          name: { $first: '$items.name' },
          sku: { $first: '$items.sku' },
          revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.qty'] } },
          qty: { $sum: '$items.qty' }
        }
      },
      { $sort: { [sortBy]: -1 } },
      { $limit: limit }
    ]);

    res.json({ success: true, data, from, to });
  } catch (err) {
    console.error('getTopProducts:', err);
    res.status(500).json({ success: false, message: 'Top products query failed' });
  }
};

/* ═══════════════════════════════════
   CUSTOMER METRICS
═══════════════════════════════════ */
export const getCustomerMetrics = async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const metric = req.query.metric || 'new';

    let data;
    if (metric === 'new') {
      data = await User.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);
    } else if (metric === 'returning') {
      data = await Order.aggregate([
        { $match: baseMatch(from, to) },
        { $group: { _id: '$customer.userId', orders: { $sum: 1 } } },
        { $match: { orders: { $gt: 1 } } },
        { $count: 'returningCustomers' }
      ]);
    } else if (metric === 'clv') {
      data = await Order.aggregate([
        { $match: { status: { $in: ['delivered', 'shipped'] } } },
        { $group: { _id: '$customer.userId', name: { $first: '$customer.name' }, totalSpend: { $sum: '$billing.grandTotal' }, orders: { $sum: 1 } } },
        { $sort: { totalSpend: -1 } },
        { $limit: 20 }
      ]);
    }

    res.json({ success: true, data, metric, from, to });
  } catch (err) {
    console.error('getCustomerMetrics:', err);
    res.status(500).json({ success: false, message: 'Customer metrics query failed' });
  }
};

/* ═══════════════════════════════════
   INVENTORY ALERTS
═══════════════════════════════════ */
export const getInventoryAlerts = async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 5;

    const data = await Product.find({
      status: 'active',
      $or: [
        { 'variants.stock': { $lte: threshold } },
        { 'stores.stock': { $lte: threshold } }
      ]
    })
    .select('name sku category variants stores status')
    .lean();

    res.json({ success: true, data, threshold });
  } catch (err) {
    console.error('getInventoryAlerts:', err);
    res.status(500).json({ success: false, message: 'Inventory alerts query failed' });
  }
};

/* ═══════════════════════════════════
   GST SUMMARY (analytics overview)
   Full reports in Phase 3 gstController
═══════════════════════════════════ */
export const getGstSummary = async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const match = baseMatch(from, to, req.query.storeId);
    const gstType = req.query.type || 'gstr1';

    const data = await Order.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.hsnCode',
          totalQty: { $sum: '$items.qty' },
          taxableAmount: { $sum: { $multiply: ['$items.unitPrice', '$items.qty'] } },
          cgst: { $sum: '$billing.cgst' },
          sgst: { $sum: '$billing.sgst' },
          igst: { $sum: '$billing.igst' }
        }
      },
      { $sort: { taxableAmount: -1 } }
    ]);

    const totals = data.reduce((acc, row) => ({
      taxableAmount: acc.taxableAmount + row.taxableAmount,
      cgst: acc.cgst + row.cgst,
      sgst: acc.sgst + row.sgst,
      igst: acc.igst + row.igst
    }), { taxableAmount: 0, cgst: 0, sgst: 0, igst: 0 });

    res.json({ success: true, data, totals, type: gstType, from, to });
  } catch (err) {
    console.error('getGstSummary:', err);
    res.status(500).json({ success: false, message: 'GST summary query failed' });
  }
};
