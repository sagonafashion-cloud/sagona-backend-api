import Order from '../models/Order.js';
import Store from '../models/Store.js';
import XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

/* ── helpers ── */
const INR = (n) => Number(n || 0).toFixed(2);

const parseDates = (query) => ({
  from: query.from ? new Date(query.from) : new Date(new Date().setDate(1)),   // 1st of current month
  to:   query.to   ? new Date(query.to)   : new Date()
});

const baseMatch = (from, to, storeId) => {
  const match = {
    createdAt: { $gte: from, $lte: to },
    status: { $nin: ['cancelled'] }
  };
  if (storeId) match['items.storeId'] = storeId;
  return match;
};

/* ── pipeline shared across reports ── */
const hsnPipeline = (match) => [
  { $match: match },
  { $unwind: '$items' },
  {
    $group: {
      _id: { hsnCode: '$items.hsnCode', taxType: '$taxType' },
      description: { $first: '$items.name' },
      totalQty:    { $sum: '$items.qty' },
      taxableAmt:  { $sum: { $multiply: ['$items.unitPrice', '$items.qty'] } },
      cgst:        { $sum: '$billing.cgst' },
      sgst:        { $sum: '$billing.sgst' },
      igst:        { $sum: '$billing.igst' }
    }
  },
  { $sort: { taxableAmt: -1 } }
];

/* ═══════════════════════════════════
   GSTR-1
═══════════════════════════════════ */
export const getGstr1 = async (req, res) => {
  try {
    const { from, to } = parseDates(req.query);
    const match = baseMatch(from, to, req.query.storeId);

    // B2C invoices (we don't capture GSTIN, so all are B2C)
    const invoices = await Order.find(match)
      .select('orderNumber customer shippingAddress billing taxType items createdAt')
      .sort({ createdAt: 1 })
      .lean();

    const b2cLarge = invoices.filter((o) => (o.billing?.grandTotal || 0) > 250000);
    const b2cSmall = invoices.filter((o) => (o.billing?.grandTotal || 0) <= 250000);

    // HSN summary
    const hsnSummary = await Order.aggregate(hsnPipeline(match));

    const totals = invoices.reduce(
      (acc, o) => ({
        taxableAmt: acc.taxableAmt + (o.billing?.taxableAmount || o.billing?.subtotal || 0),
        cgst:       acc.cgst       + (o.billing?.cgst          || 0),
        sgst:       acc.sgst       + (o.billing?.sgst          || 0),
        igst:       acc.igst       + (o.billing?.igst          || 0),
        grandTotal: acc.grandTotal + (o.billing?.grandTotal    || 0)
      }),
      { taxableAmt: 0, cgst: 0, sgst: 0, igst: 0, grandTotal: 0 }
    );

    res.json({
      success: true,
      data: {
        reportType: 'GSTR-1',
        period: { from, to },
        b2cLarge: { invoices: b2cLarge, count: b2cLarge.length },
        b2cSmall: { invoices: b2cSmall, count: b2cSmall.length },
        hsnSummary,
        totals
      }
    });
  } catch (err) {
    console.error('getGstr1:', err);
    res.status(500).json({ success: false, message: 'GSTR-1 report failed' });
  }
};

/* ═══════════════════════════════════
   GSTR-3B
═══════════════════════════════════ */
export const getGstr3b = async (req, res) => {
  try {
    const { from, to } = parseDates(req.query);
    const match = baseMatch(from, to, req.query.storeId);

    const [summary] = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalTaxableSupplies: { $sum: { $ifNull: ['$billing.taxableAmount', '$billing.subtotal'] } },
          totalCgst:            { $sum: '$billing.cgst' },
          totalSgst:            { $sum: '$billing.sgst' },
          totalIgst:            { $sum: '$billing.igst' },
          orderCount:           { $sum: 1 }
        }
      }
    ]);

    const totalOutward = (summary?.totalCgst || 0) + (summary?.totalSgst || 0) + (summary?.totalIgst || 0);

    res.json({
      success: true,
      data: {
        reportType: 'GSTR-3B',
        period: { from, to },
        outwardSupplies: {
          taxableValue: INR(summary?.totalTaxableSupplies),
          cgst:         INR(summary?.totalCgst),
          sgst:         INR(summary?.totalSgst),
          igst:         INR(summary?.totalIgst),
          totalTax:     INR(totalOutward),
          orderCount:   summary?.orderCount || 0
        },
        // ITC (input tax credit) not tracked — set to 0
        itc: { cgst: '0.00', sgst: '0.00', igst: '0.00' },
        netPayable: {
          cgst: INR(summary?.totalCgst),
          sgst: INR(summary?.totalSgst),
          igst: INR(summary?.totalIgst),
          total: INR(totalOutward)
        }
      }
    });
  } catch (err) {
    console.error('getGstr3b:', err);
    res.status(500).json({ success: false, message: 'GSTR-3B report failed' });
  }
};

/* ═══════════════════════════════════
   HSN SUMMARY
═══════════════════════════════════ */
export const getHsnSummary = async (req, res) => {
  try {
    const { from, to } = parseDates(req.query);
    const match = baseMatch(from, to, req.query.storeId);

    const rows = await Order.aggregate(hsnPipeline(match));

    const formatted = rows.map((r) => ({
      hsnCode:     r._id.hsnCode || 'N/A',
      description: r.description,
      taxType:     r._id.taxType,
      totalQty:    r.totalQty,
      taxableAmt:  INR(r.taxableAmt),
      cgst:        INR(r.cgst),
      sgst:        INR(r.sgst),
      igst:        INR(r.igst),
      totalTax:    INR(r.cgst + r.sgst + r.igst)
    }));

    res.json({ success: true, data: formatted, period: { from, to } });
  } catch (err) {
    console.error('getHsnSummary:', err);
    res.status(500).json({ success: false, message: 'HSN summary failed' });
  }
};

/* ═══════════════════════════════════
   INVOICE REGISTER (full list)
═══════════════════════════════════ */
export const getInvoiceRegister = async (req, res) => {
  try {
    const { from, to } = parseDates(req.query);
    const match = baseMatch(from, to, req.query.storeId);

    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Order.find(match)
        .select('orderNumber customer shippingAddress billing taxType createdAt invoiceUrl payment.status')
        .sort({ createdAt: 1 })
        .skip(skip).limit(limit)
        .lean(),
      Order.countDocuments(match)
    ]);

    res.json({ success: true, data, total, page, limit, period: { from, to } });
  } catch (err) {
    console.error('getInvoiceRegister:', err);
    res.status(500).json({ success: false, message: 'Invoice register failed' });
  }
};

/* ═══════════════════════════════════
   EXPORT (CSV / XLSX / PDF)
═══════════════════════════════════ */
export const exportGstReport = async (req, res) => {
  try {
    const { from, to } = parseDates(req.query);
    const format = (req.query.format || 'xlsx').toLowerCase();
    const type   = (req.query.type   || 'hsn').toLowerCase();
    const match  = baseMatch(from, to, req.query.storeId);

    /* Build flat rows for the requested report type */
    let rows = [];
    if (type === 'hsn') {
      const raw = await Order.aggregate(hsnPipeline(match));
      rows = raw.map((r) => ({
        'HSN Code':       r._id.hsnCode || 'N/A',
        'Description':    r.description,
        'Tax Type':       r._id.taxType,
        'Total Qty':      r.totalQty,
        'Taxable Amount': Number(INR(r.taxableAmt)),
        'CGST':           Number(INR(r.cgst)),
        'SGST':           Number(INR(r.sgst)),
        'IGST':           Number(INR(r.igst)),
        'Total Tax':      Number(INR(r.cgst + r.sgst + r.igst))
      }));
    } else {
      // Invoice register rows
      const invoices = await Order.find(match)
        .select('orderNumber customer shippingAddress billing taxType createdAt payment')
        .sort({ createdAt: 1 }).lean();

      rows = invoices.map((o) => ({
        'Invoice No':      o.orderNumber,
        'Date':            new Date(o.createdAt).toLocaleDateString('en-IN'),
        'Customer':        o.customer?.name || '',
        'State':           o.shippingAddress?.state || '',
        'Tax Type':        o.taxType,
        'Taxable Amount':  Number(INR(o.billing?.taxableAmount || o.billing?.subtotal)),
        'CGST':            Number(INR(o.billing?.cgst)),
        'SGST':            Number(INR(o.billing?.sgst)),
        'IGST':            Number(INR(o.billing?.igst)),
        'Shipping':        Number(INR(o.billing?.shippingCharge)),
        'Grand Total':     Number(INR(o.billing?.grandTotal)),
        'Payment Status':  o.payment?.status || ''
      }));
    }

    const fromStr = new Date(from).toISOString().slice(0, 10);
    const toStr   = new Date(to).toISOString().slice(0, 10);
    const fname   = `sagona_gst_${type}_${fromStr}_${toStr}`;

    if (format === 'csv') {
      const headers = Object.keys(rows[0] || {});
      const csv = [
        headers.join(','),
        ...rows.map((r) => headers.map((h) => `"${r[h] ?? ''}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Disposition', `attachment; filename="${fname}.csv"`);
      res.setHeader('Content-Type', 'text/csv');
      return res.send(csv);
    }

    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, type.toUpperCase());
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', `attachment; filename="${fname}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }

    if (format === 'pdf') {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      res.setHeader('Content-Disposition', `attachment; filename="${fname}.pdf"`);
      res.setHeader('Content-Type', 'application/pdf');
      doc.pipe(res);

      doc.fontSize(16).font('Helvetica-Bold').text('SAGONA', 40, 40);
      doc.fontSize(11).font('Helvetica').fillColor('#555555')
         .text(`GST Report — ${type.toUpperCase()} | ${fromStr} to ${toStr}`, 40, 65);
      doc.moveDown();

      if (rows.length === 0) {
        doc.fontSize(10).fillColor('#333333').text('No data for selected period.');
      } else {
        const headers = Object.keys(rows[0]);
        const colW = Math.floor(515 / headers.length);

        // Header row
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#333333');
        headers.forEach((h, i) => doc.text(h, 40 + i * colW, doc.y, { width: colW - 2, continued: i < headers.length - 1 }));
        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#cccccc');
        doc.moveDown(0.3);

        // Data rows
        doc.fontSize(6.5).font('Helvetica').fillColor('#111111');
        for (const row of rows) {
          if (doc.y > 750) doc.addPage();
          Object.values(row).forEach((v, i) => {
            doc.text(String(v ?? ''), 40 + i * colW, doc.y, { width: colW - 2, continued: i < headers.length - 1 });
          });
          doc.moveDown(0.2);
        }
      }

      doc.end();
      return;
    }

    res.status(400).json({ success: false, message: 'format must be csv, xlsx, or pdf' });
  } catch (err) {
    console.error('exportGstReport:', err);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
};

/* ═══════════════════════════════════
   CONSOLIDATED (all stores + state breakdown)
═══════════════════════════════════ */
export const getConsolidated = async (req, res) => {
  try {
    const { from, to } = parseDates(req.query);
    const format = (req.query.format || 'json').toLowerCase();

    const stateData = await Order.aggregate([
      { $match: baseMatch(from, to) },
      {
        $group: {
          _id: '$shippingAddress.state',
          orderCount:   { $sum: 1 },
          taxableAmt:   { $sum: { $ifNull: ['$billing.taxableAmount', '$billing.subtotal'] } },
          cgst:         { $sum: '$billing.cgst' },
          sgst:         { $sum: '$billing.sgst' },
          igst:         { $sum: '$billing.igst' },
          grandTotal:   { $sum: '$billing.grandTotal' }
        }
      },
      { $sort: { grandTotal: -1 } },
      {
        $project: {
          state:      '$_id',
          orderCount: 1, taxableAmt: 1, cgst: 1, sgst: 1, igst: 1, grandTotal: 1, _id: 0
        }
      }
    ]);

    const overallTotals = stateData.reduce(
      (acc, r) => ({
        orderCount: acc.orderCount + r.orderCount,
        taxableAmt: acc.taxableAmt + r.taxableAmt,
        cgst:       acc.cgst       + r.cgst,
        sgst:       acc.sgst       + r.sgst,
        igst:       acc.igst       + r.igst,
        grandTotal: acc.grandTotal + r.grandTotal
      }),
      { orderCount: 0, taxableAmt: 0, cgst: 0, sgst: 0, igst: 0, grandTotal: 0 }
    );

    if (format === 'json') {
      return res.json({ success: true, data: stateData, totals: overallTotals, period: { from, to } });
    }

    // XLSX
    const rows = stateData.map((r) => ({
      State:           r.state || 'Unknown',
      Orders:          r.orderCount,
      'Taxable Amount': Number(INR(r.taxableAmt)),
      CGST:             Number(INR(r.cgst)),
      SGST:             Number(INR(r.sgst)),
      IGST:             Number(INR(r.igst)),
      'Grand Total':    Number(INR(r.grandTotal))
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Consolidated');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fname  = `sagona_consolidated_${new Date(from).toISOString().slice(0, 10)}_${new Date(to).toISOString().slice(0, 10)}`;

    res.setHeader('Content-Disposition', `attachment; filename="${fname}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('getConsolidated:', err);
    res.status(500).json({ success: false, message: 'Consolidated report failed' });
  }
};
