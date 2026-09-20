import mongoose from 'mongoose';

/* ── sub-schemas ── */

const purchaseInvoiceItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  hsnCode:     { type: String, trim: true },
  qty:         { type: Number, min: 0 },
  unitPrice:   { type: Number, min: 0 },
  taxableValue: { type: Number, required: true, min: 0 },
  // Vendor's rate on THIS invoice line — intentionally a free-form 0-100
  // number, not constrained to Product.js's gstSlab enum. A purchase invoice
  // comes from an external vendor and can carry a rate our own retail
  // catalog doesn't sell at (services, packaging, raw material, a
  // compensation-cess item, etc.); reusing the product enum here would
  // reject legitimate vendor invoices whenever the two rate sets diverge.
  gstRate: { type: Number, min: 0, max: 100, default: 0 }
}, { _id: false });

const purchaseBillingSchema = new mongoose.Schema({
  taxableValue: { type: Number, default: 0 },
  cgst:         { type: Number, default: 0 },
  sgst:         { type: Number, default: 0 },
  igst:         { type: Number, default: 0 },
  // Cess is entered manually rather than derived from a slab — cess rates
  // vary by product/notification (sin goods, luxury items, etc.) in a way
  // that doesn't reduce to a single percentage the way CGST/SGST/IGST do, so
  // it's taken as-is from the vendor's invoice instead of computed here.
  cess:         { type: Number, default: 0 },
  invoiceValue: { type: Number, default: 0 } // taxableValue + cgst + sgst + igst + cess
}, { _id: false });

/* ── main schema ── */

const purchaseInvoiceSchema = new mongoose.Schema(
  {
    vendor: {
      name:  { type: String, required: true, trim: true },
      gstin: { type: String, trim: true, uppercase: true },
      state: { type: String, trim: true }
    },

    invoiceNumber: { type: String, required: true, trim: true },
    invoiceDate:   { type: Date, required: true },
    placeOfSupply: { type: String, trim: true }, // state of supply, per GSTR-2 report column

    reverseCharge: { type: Boolean, default: false },

    // Matches the "Invoice Type" column in the GSTR-2 B2B sample report.
    invoiceType: {
      type: String,
      enum: ['Regular', 'SEZ supplies with payment', 'SEZ supplies without payment', 'Deemed Exports'],
      default: 'Regular'
    },

    // intra = CGST+SGST (vendor and SAGONA's receiving location in the same
    // state), inter = IGST — same convention as Order.js's taxType.
    taxType: { type: String, enum: ['intra', 'inter'], required: true },

    items: {
      type: [purchaseInvoiceItemSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'Purchase invoice must contain at least one item'
      }
    },

    billing: purchaseBillingSchema,

    paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },

    // URL of the scanned/uploaded vendor invoice copy — uses the dedicated
    // POST /api/admin/upload/invoice-attachment endpoint (routes/uploadRoutes.js),
    // which accepts image OR PDF (vendor invoices are commonly PDFs, unlike
    // product photos), not stored as a binary blob here.
    attachmentUrl: { type: String },

    notes: { type: String, trim: true },

    // Soft-delete/void pattern for a financial record — never hard-deleted,
    // so a cancelled entry stays available for audit trail and doesn't
    // silently disappear from historical GST reports that already included it.
    status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
    cancelledAt: { type: Date },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }
  },
  { timestamps: true }
);

purchaseInvoiceSchema.index({ invoiceDate: -1 });
purchaseInvoiceSchema.index({ 'vendor.gstin': 1 });
purchaseInvoiceSchema.index({ status: 1, invoiceDate: -1 });
// NOTE: deliberately no unique index on (vendor.gstin + invoiceNumber). A
// compound sparse-unique index would still collide across different
// unregistered vendors (no GSTIN) that happen to reuse the same invoice
// number, which is common for small/local vendors — so duplicate detection,
// if wanted later, belongs in the controller as a soft warning, not a hard
// DB constraint that could block a legitimate entry.

const PurchaseInvoice = mongoose.model('PurchaseInvoice', purchaseInvoiceSchema);

export default PurchaseInvoice;
