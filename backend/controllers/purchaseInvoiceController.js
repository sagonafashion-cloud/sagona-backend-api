import PurchaseInvoice from '../models/PurchaseInvoice.js';
import { gstRates } from '../utils/taxCalculator.js';
import { logAdminActivity } from '../utils/activityLogger.js';
import { extractInvoice } from '../utils/invoiceExtractor.js';
import Product from '../models/Product.js';
import { randomUUID } from 'crypto';

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

// Whitelists each line and guarantees a stable lineKey. productId is NEVER
// taken from the client — it is only set by submitPurchaseInvoice (or carried
// over from the stored line with the same lineKey on update), so a client can't
// link a line to an arbitrary product.
const numOrUndef = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v));
function sanitizeItems(items, existingItems = []) {
  const byKey = new Map((existingItems || []).map((it) => [it.lineKey, it]));
  return items.map((it) => {
    const lineKey = it.lineKey && String(it.lineKey).trim() ? String(it.lineKey).trim() : randomUUID().slice(0, 12);
    const prev = byKey.get(lineKey);
    return {
      lineKey,
      description:  it.description,
      hsnCode:      it.hsnCode,
      qty:          numOrUndef(it.qty),
      unitPrice:    numOrUndef(it.unitPrice),
      taxableValue: it.taxableValue,
      gstRate:      it.gstRate,
      costPrice:    numOrUndef(it.costPrice),
      sellingPrice: numOrUndef(it.sellingPrice),
      mrp:          numOrUndef(it.mrp),
      sku:          it.sku ? String(it.sku).trim() || undefined : undefined,
      productId:    prev?.productId
    };
  });
}

// Apparel GST 2.0: <= Rs 2,500 per unit = 5%, above = 18%. Suggestion only —
// the content admin can change it; the final classification is a CA decision.
const suggestGstSlab = (unitSellingPrice) => (Number(unitSellingPrice) > 2500 ? 18 : 5);

// Explicit field whitelist — never pass raw req.body into create/update
// (same defense-in-depth pattern as productController.js / storeController.js).
const pickFields = (body = {}) => {
  const {
    vendor, invoiceNumber, invoiceDate, placeOfSupply, reverseCharge,
    invoiceType, taxType, items, cess, paymentStatus, attachmentUrl, notes
  } = body;
  return { vendor, invoiceNumber, invoiceDate, placeOfSupply, reverseCharge, invoiceType, taxType, items, cess, paymentStatus, attachmentUrl, notes };
};

// POST /api/admin/purchase-invoices/extract  (multipart, field "file")
// Reads a vendor invoice photo/PDF with AI and returns an UNSAVED draft for the
// super admin to verify in the Add Invoice form. Saves nothing; on any failure
// the client falls back to manual entry, so the existing flow is never blocked.
export const extractPurchaseInvoice = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const { draft, warnings, usage } = await extractInvoice(req.file.buffer);

    // Soft duplicate warning (no DB constraint by design — see model note).
    if (draft.invoiceNumber) {
      const dupQuery = { invoiceNumber: draft.invoiceNumber, status: { $ne: 'cancelled' } };
      if (draft.vendor?.gstin) dupQuery['vendor.gstin'] = draft.vendor.gstin;
      else if (draft.vendor?.name) dupQuery['vendor.name'] = draft.vendor.name;
      const dup = await PurchaseInvoice.findOne(dupQuery).select('_id invoiceNumber invoiceDate').lean();
      if (dup) warnings.unshift(`An invoice numbered ${dup.invoiceNumber} from this vendor already exists. Saving again would double-count it.`);
    }

    logAdminActivity(req, 'purchase_invoice.extract', {
      targetType: 'PurchaseInvoice',
      details: { lines: draft.items.length, ...usage }
    });

    res.json({ success: true, data: draft, warnings });
  } catch (err) {
    console.error('extractPurchaseInvoice:', err.message);
    const status = err.code === 'NOT_CONFIGURED' ? 503 : 422;
    res.status(status).json({
      success: false,
      message: err.code === 'NOT_CONFIGURED'
        ? err.message
        : 'Could not read this invoice automatically. Please enter the details manually.'
    });
  }
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

    fields.items = sanitizeItems(fields.items);
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
    if (fields.items !== undefined) {
      if (!Array.isArray(fields.items) || !fields.items.length) {
        return res.status(400).json({ success: false, message: 'At least one line item required' });
      }
      fields.items = sanitizeItems(fields.items, existing.items);
      // A line that already created a product can't be dropped — the product
      // would be orphaned from its purchase record.
      const keptKeys = new Set(fields.items.map((i) => i.lineKey));
      const dropped = existing.items.filter((i) => i.productId && !keptKeys.has(i.lineKey));
      if (dropped.length) {
        return res.status(400).json({
          success: false,
          message: `Cannot remove line(s) that already created products: ${dropped.map((d) => d.description).join(', ')}`
        });
      }
    }
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

// POST /api/admin/purchase-invoices/:id/submit
// Creates ONE draft product per invoice line (stock = invoice qty) so the
// content admin can finish name/photos/description and activate it. Safe to
// call repeatedly: lines that already have a product are skipped, and a
// product found by (invoice, lineKey) is re-linked rather than duplicated.
// Drafts are not sellable (checkout only sells status:'active'), so this has
// no effect on the live storefront until a content admin activates a product.
export const submitPurchaseInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Purchase invoice not found' });
    if (invoice.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot create products from a cancelled invoice' });
    }

    // Validate every line that still needs a product before creating any.
    const pending = invoice.items.filter((it) => !it.productId);
    const problems = [];
    pending.forEach((it, i) => {
      const label = it.description || `Line ${i + 1}`;
      if (!(it.sellingPrice > 0)) problems.push(`${label}: selling price is required`);
      else if (it.mrp !== undefined && it.mrp !== null && it.mrp < it.sellingPrice) problems.push(`${label}: MRP (${it.mrp}) is below selling price (${it.sellingPrice})`);
      if (!(it.qty > 0)) problems.push(`${label}: quantity is required to set opening stock`);
      if (!it.lineKey) problems.push(`${label}: line has no id — save the invoice again`);
    });
    if (problems.length) {
      return res.status(400).json({ success: false, message: `Invoice saved, but products were not created. Fix and save again: ${problems.join('; ')}`, problems });
    }

    const created = [];
    const linked = [];
    for (const it of pending) {
      let product = await Product.findOne({ purchaseInvoiceId: invoice._id, purchaseLineKey: it.lineKey }).select('_id');
      if (product) {
        linked.push(product._id);
      } else {
        const unit = it.sellingPrice;
        product = await Product.create({
          name: it.description,
          vendorDescription: it.description,
          price: unit,
          mrp: it.mrp,
          costPrice: it.costPrice ?? it.unitPrice,
          hsnCode: it.hsnCode,
          gstSlab: suggestGstSlab(unit),
          sku: it.sku || undefined,
          stock: Math.floor(it.qty),
          status: 'draft',
          purchaseInvoiceId: invoice._id,
          purchaseLineKey: it.lineKey
        });
        created.push(product._id);
      }
      it.productId = product._id;
      await invoice.save(); // persist the link per line so a mid-way failure is resumable
    }

    if (invoice.status === 'draft') invoice.status = 'active';
    invoice.submittedAt = invoice.submittedAt || new Date();
    await invoice.save();

    logAdminActivity(req, 'purchase_invoice.submit', {
      targetType: 'PurchaseInvoice',
      targetId: invoice._id,
      details: { created: created.length, relinked: linked.length }
    });

    res.json({
      success: true,
      message: `${created.length} draft product(s) created`,
      data: { created: created.length, relinked: linked.length, invoice }
    });
  } catch (err) {
    console.error('submitPurchaseInvoice:', err);
    const dupSku = err.code === 11000;
    res.status(dupSku ? 400 : 500).json({
      success: false,
      message: dupSku ? 'A product with this SKU already exists. Change the SKU on that line and submit again.' : 'Failed to create products from invoice'
    });
  }
};

// Soft-delete/void — never a hard delete. A financial record that's already
// been counted in a filed GST report must stay queryable for audit trail;
// cancelling excludes it from the *default* list/report view (see
// listPurchaseInvoices' status filter) without erasing history.
export const cancelPurchaseInvoice = async (req, res) => {
  try {
    const existing = await PurchaseInvoice.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ success: false, message: 'Purchase invoice not found' });

    // Products created from this invoice: refuse if any is already on sale (or
    // was) — cancelling the purchase record must not silently orphan live stock.
    const linkedIds = (existing.items || []).map((i) => i.productId).filter(Boolean);
    if (linkedIds.length) {
      const live = await Product.find({ _id: { $in: linkedIds }, status: { $in: ['active', 'out_of_stock'] } }).select('name').lean();
      if (live.length) {
        return res.status(400).json({
          success: false,
          message: `Cannot cancel: these products from this invoice are already live — archive them first: ${live.map((p) => p.name).join(', ')}`
        });
      }
      await Product.updateMany({ _id: { $in: linkedIds }, status: 'draft' }, { status: 'archived' });
    }

    const invoice = await PurchaseInvoice.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled', cancelledAt: new Date() },
      { new: true }
    );

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
