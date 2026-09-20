import PurchaseInvoice from '../models/PurchaseInvoice.js';
import { gstRates } from '../utils/taxCalculator.js';
import { logAdminActivity } from '../utils/activityLogger.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Derives billing.{taxableValue,cgst,sgst,igst,invoiceValue} from items +
// taxType. Reuses taxCalculator.js's gstRates() helper — the same
// CGST/SGST/IGST split rule sales orders use — rather than reimplementing it,
// so the two can't drift into different interpretations of the same
// statutory rule. Does NOT reuse calculateTax() from that file: that
// function is sales-price/MRP-discount specific (checkout's logic) and out
// of scope for vendor purchase invoices, which have no MRP/discount concept.
function computeBilling(items, taxType, cess = 0) {
  let taxableValue = 0, cgst = 0, sgst = 0, igst = 0;

  for (const item of items) {
    const itemTaxable = Number(item.taxableValue || 0);
    const rate = Number(item.gstRate || 0);
    taxableValue += itemTaxable;

    const { cgstRate, sgstRate, igstRate } = gstRates(rate, taxType);
    cgst += (itemTaxable * cgstRate) / 100;
    sgst += (itemTaxable * sgstRate) / 100;
    igst += (itemTaxable * igstRate) / 100;
  }

  const cessAmt = Number(cess || 0);
  const invoiceValue = taxableValue + cgst + sgst + igst + cessAmt;

  return {
    taxableValue: round2(taxableValue),
    cgst: round2(cgst),
    sgst: round2(sgst),
    igst: round2(igst),
    cess: round2(cessAmt),
    invoiceValue: round2(invoiceValue)
  };
}

// Explicit field whitelist — never pass raw req.body into create/update
// (same defense-in-depth pattern as productController.js / storeController.js).
const pickFields = (body = {}) => {
  const {
    vendor, invoiceNumber, invoiceDate, placeOfSupply, reverseCharge,
    invoiceType, taxType, items, cess, paymentStatus, attachmentUrl, notes
  } = body;
  return { vendor, invoiceNumber, invoiceDate, placeOfSupply, reverseCharge, invoiceType, taxType, items, cess, paymentStatus, attachmentUrl, notes };
};

export const listPurchaseInvoices = async (req, res) => {
  try {
    const { from, to, vendorGstin, status, page = 1, limit = 50 } = req.query;

    const query = {};
    // Default to hiding cancelled invoices unless explicitly requested —
    // mirrors the "active by default" convention used elsewhere (Store.js,
    // Product.js's archived status).
    query.status = status || 'active';
    if (vendorGstin) query['vendor.gstin'] = vendorGstin.toUpperCase();
    if (from || to) {
      query.invoiceDate = {};
      if (from) query.invoiceDate.$gte = new Date(from);
      if (to)   query.invoiceDate.$lte = new Date(to);
    }

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const [invoices, total] = await Promise.all([
      PurchaseInvoice.find(query)
        .sort({ invoiceDate: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      PurchaseInvoice.countDocuments(query)
    ]);

    res.json({ success: true, data: invoices, pagination: { page: pageNum, limit: limitNum, total } });
  } catch (err) {
    console.error('listPurchaseInvoices:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch purchase invoices' });
  }
};

export const getPurchaseInvoiceById = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Purchase invoice not found' });
    res.json({ success: true, data: invoice });
  } catch (err) {
    console.error('getPurchaseInvoiceById:', err);
    res.status(400).json({ success: false, message: 'Invalid purchase invoice id' });
  }
};

export const createPurchaseInvoice = async (req, res) => {
  try {
    const fields = pickFields(req.body);

    if (!fields.vendor?.name) {
      return res.status(400).json({ success: false, message: 'Vendor name required' });
    }
    if (!fields.invoiceNumber || !fields.invoiceDate) {
      return res.status(400).json({ success: false, message: 'Invoice number and date required' });
    }
    if (!Array.isArray(fields.items) || !fields.items.length) {
      return res.status(400).json({ success: false, message: 'At least one line item required' });
    }
    if (!['intra', 'inter'].includes(fields.taxType)) {
      return res.status(400).json({ success: false, message: 'taxType must be intra or inter' });
    }

    const billing = computeBilling(fields.items, fields.taxType, fields.cess);

    const invoice = await PurchaseInvoice.create({
      vendor: fields.vendor,
      invoiceNumber: fields.invoiceNumber,
      invoiceDate: fields.invoiceDate,
      placeOfSupply: fields.placeOfSupply,
      reverseCharge: !!fields.reverseCharge,
      invoiceType: fields.invoiceType || 'Regular',
      taxType: fields.taxType,
      items: fields.items,
      billing,
      paymentStatus: fields.paymentStatus || 'unpaid',
      attachmentUrl: fields.attachmentUrl,
      notes: fields.notes,
      createdBy: req.adminUser?._id
    });

    logAdminActivity(req, 'purchase_invoice.create', {
      targetType: 'PurchaseInvoice',
      targetId: invoice._id,
      details: {
        vendor: invoice.vendor?.name,
        invoiceNumber: invoice.invoiceNumber,
        invoiceValue: invoice.billing?.invoiceValue
      }
    });

    res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    console.error('createPurchaseInvoice:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to create purchase invoice' });
  }
};

export const updatePurchaseInvoice = async (req, res) => {
  try {
    const existing = await PurchaseInvoice.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Purchase invoice not found' });
    if (existing.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot edit a cancelled invoice' });
    }

    const fields = pickFields(req.body);
    const update = {};
    // Merge, don't replace — a client sending a partial vendor object (e.g.
    // just an updated gstin) would otherwise silently wipe vendor.state/name
    // for any key it didn't include, unlike every other field here which is
    // either scalar or (for items/taxType/cess) explicitly merged below.
    if (fields.vendor !== undefined) {
      update.vendor = { ...(existing.vendor?.toObject?.() ?? existing.vendor ?? {}), ...fields.vendor };
    }
    if (fields.invoiceNumber   !== undefined) update.invoiceNumber   = fields.invoiceNumber;
    if (fields.invoiceDate     !== undefined) update.invoiceDate     = fields.invoiceDate;
    if (fields.placeOfSupply   !== undefined) update.placeOfSupply   = fields.placeOfSupply;
    if (fields.reverseCharge   !== undefined) update.reverseCharge   = fields.reverseCharge;
    if (fields.invoiceType     !== undefined) update.invoiceType     = fields.invoiceType;
    if (fields.paymentStatus   !== undefined) update.paymentStatus   = fields.paymentStatus;
    if (fields.attachmentUrl   !== undefined) update.attachmentUrl   = fields.attachmentUrl;
    if (fields.notes           !== undefined) update.notes           = fields.notes;

    // items/taxType/cess are interdependent (billing is derived from all
    // three together), so if ANY of them changes, recompute using the
    // merged view of old + new rather than partially-updating derived totals.
    const nextItems   = fields.items   !== undefined ? fields.items   : existing.items;
    const nextTaxType = fields.taxType !== undefined ? fields.taxType : existing.taxType;
    const nextCess    = fields.cess    !== undefined ? fields.cess    : existing.billing?.cess;

    if (fields.items !== undefined) update.items = fields.items;
    if (fields.taxType !== undefined) update.taxType = fields.taxType;
    if (fields.items !== undefined || fields.taxType !== undefined || fields.cess !== undefined) {
      update.billing = computeBilling(nextItems, nextTaxType, nextCess);
    }

    const invoice = await PurchaseInvoice.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );

    logAdminActivity(req, 'purchase_invoice.update', {
      targetType: 'PurchaseInvoice',
      targetId: invoice._id,
      details: { changedFields: Object.keys(update), after: update }
    });

    res.json({ success: true, data: invoice });
  } catch (err) {
    console.error('updatePurchaseInvoice:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to update purchase invoice' });
  }
};

// Soft-delete/void — never a hard delete. A financial record that's already
// been counted in a filed GST report must stay queryable for audit trail;
// cancelling excludes it from the *default* list/report view (see
// listPurchaseInvoices' status filter) without erasing history.
export const cancelPurchaseInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled', cancelledAt: new Date() },
      { new: true }
    );
    if (!invoice) return res.status(404).json({ success: false, message: 'Purchase invoice not found' });

    logAdminActivity(req, 'purchase_invoice.cancel', {
      targetType: 'PurchaseInvoice',
      targetId: invoice._id,
      details: { vendor: invoice.vendor?.name, invoiceNumber: invoice.invoiceNumber }
    });

    res.json({ success: true, message: 'Purchase invoice cancelled', data: invoice });
  } catch (err) {
    console.error('cancelPurchaseInvoice:', err);
    res.status(400).json({ success: false, message: 'Invalid purchase invoice id' });
  }
};
