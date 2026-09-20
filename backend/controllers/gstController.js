import Order from '../models/Order.js';
import Store from '../models/Store.js';
import PurchaseInvoice from '../models/PurchaseInvoice.js';
import { gstRates } from '../utils/taxCalculator.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

/* ── helpers ── */
const INR = (n) => Number(n || 0).toFixed(2);
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Matches the sample reports' subtitle format exactly, e.g.
// "GSTR1 Report - Full Summary (Apr 2024 To Jun 2024)".
const monthRangeLabel = (from, to) => {
  const f = new Date(from), t = new Date(to);
  return `${MONTHS[f.getUTCMonth()]} ${f.getUTCFullYear()} To ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
};

// Builds an .xlsx buffer from an array of plain row objects (replaces the
// previous XLSX.utils.book_new/json_to_sheet/write flow, using ExcelJS).
async function rowsToXlsxBuffer(rows, sheetName) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  const headers = Object.keys(rows[0] || {});
  if (headers.length) {
    worksheet.addRow(headers);
    rows.forEach((r) => worksheet.addRow(headers.map((h) => r[h])));
  }

  return workbook.xlsx.writeBuffer();
}

// GST return periods follow the Indian financial calendar (IST), regardless
// of the host server's system timezone — so "1st of current month" must be
// computed relative to IST midnight, not server-local midnight.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const startOfCurrentMonthIST = () => {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS); // wall-clock IST time, UTC-tagged
  const startIST = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), 1, 0, 0, 0));
  return new Date(startIST.getTime() - IST_OFFSET_MS);  // back to a real UTC instant
};

const parseDates = (query) => ({
  from: query.from ? new Date(query.from) : startOfCurrentMonthIST(),
  to:   query.to   ? new Date(query.to)   : new Date()
});

// 'returned' is excluded alongside 'cancelled' so a reversed sale doesn't
// keep inflating GST totals forever — there's no credit-note/reversal model
// in this codebase, so the only way to keep these reports honest is to drop
// returned orders from the source data entirely. This mirrors the exclusion
// analyticsController.js already applies to revenue (`$nin: ['cancelled',
// 'returned']`); GST reporting had fallen out of sync with that behavior.
const baseMatch = (from, to, storeId) => {
  const match = {
    createdAt: { $gte: from, $lte: to },
    status: { $nin: ['cancelled', 'returned'] }
  };
  if (storeId) match['items.storeId'] = storeId;
  return match;
};

/* ── pipeline shared across reports ──
   Grouped by productId (not hsnCode): hsnCode is an optional per-line
   snapshot field, and multiple distinct products with a blank/shared HSN
   code used to collapse into a single mislabeled row (description picked via
   $first from whichever item the aggregation happened to see first).
   Tax is NOT summed from order-level billing.cgst/sgst/igst here — those are
   whole-order totals, so summing them per unwound line item double- (or
   triple-, etc.) counts an order's tax across every group its items land in.
   Instead this only accumulates qty/taxable amount per line, and callers
   derive cgst/sgst/igst from taxableAmt + gstSlab + taxType via gstRates(),
   the same per-line tax math already used by the Phase 4 summary builders. */
const hsnPipeline = (match) => [
  { $match: match },
  { $unwind: '$items' },
  {
    $group: {
      _id: { productId: '$items.productId', taxType: '$taxType' },
      hsnCode:     { $first: '$items.hsnCode' },
      description: { $first: '$items.name' },
      gstSlab:     { $first: '$items.gstSlab' },
      totalQty:    { $sum: '$items.qty' },
      taxableAmt:  { $sum: { $multiply: ['$items.unitPrice', '$items.qty'] } }
    }
  },
  { $sort: { taxableAmt: -1 } }
];

// Shared by getGstr1, getHsnSummary and exportGstReport(type=hsn) so the
// productId-grouping + per-line tax derivation only lives in one place.
async function computeHsnRows(match) {
  const raw = await Order.aggregate(hsnPipeline(match));
  return raw.map((r) => {
    const { cgstRate, sgstRate, igstRate } = gstRates(r.gstSlab || 0, r._id.taxType);
    const taxableAmt = round2(r.taxableAmt);
    const cgst = round2((taxableAmt * cgstRate) / 100);
    const sgst = round2((taxableAmt * sgstRate) / 100);
    const igst = round2((taxableAmt * igstRate) / 100);
    return {
      hsnCode:     r.hsnCode || 'N/A',
      description: r.description,
      taxType:     r._id.taxType,
      totalQty:    r.totalQty,
      taxableAmt,
      cgst, sgst, igst,
      totalTax: round2(cgst + sgst + igst)
    };
  });
}

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

    // B2C(Large): interstate (taxType 'inter') supplies to unregistered
    // persons with invoice value > ₹1,00,000 — per Notification No. 12/2024
    // (dated 10-Jul-2024), effective 1-Aug-2024. This lowered the threshold
    // from the earlier ₹2.5 lakh AND restricted it to interstate supplies
    // only; intrastate orders of any value are always B2C(Small).
    const isB2cLarge = (o) => o.taxType === 'inter' && (o.billing?.grandTotal || 0) > 100000;
    const b2cLarge = invoices.filter(isB2cLarge);
    const b2cSmall = invoices.filter((o) => !isB2cLarge(o));

    // HSN summary
    const hsnSummary = await computeHsnRows(match);

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

/* ═══════════════════════════════════════════════════════════════════════
   PHASE 4 — EXACT-FORMAT SUMMARY REPORTS (GSTR-1 / GSTR-2 / GSTR-3B)

   The functions above (getGstr1, getGstr3b) return raw data shapes for
   internal/API consumption. The three builders below instead reproduce the
   statutory "Full Summary" / "B2B" report LAYOUTS the business already uses
   (one row per particular/table-number, matching column-for-column), so a
   generated report can be handed to the CA in the same shape as before.

   Kept as separate functions rather than reshaping getGstr1/getGstr3b, so
   any existing caller of the original endpoints is unaffected.
═══════════════════════════════════════════════════════════════════════ */

// Splits one order's items into the nil-rated (gstSlab === 0) portion and the
// taxable portion. Order.billing.taxableAmount is a single blended figure
// covering both, so the GSTR-1 Table 7 (taxable) vs Table 8 (nil-rated) split
// has to be recomputed per line item — it can't be read off billing directly.
function splitOrderNilVsTaxable(order) {
  let nilAmt = 0, taxableAmt = 0;
  for (const item of order.items || []) {
    const lineAmt = Number(item.unitPrice || 0) * Number(item.qty || 0);
    if (Number(item.gstSlab || 0) === 0) nilAmt += lineAmt;
    else taxableAmt += lineAmt;
  }
  return { nilAmt: round2(nilAmt), taxableAmt: round2(taxableAmt) };
}

const isB2cLargeOrder = (o) => o.taxType === 'inter' && (o.billing?.grandTotal || 0) > 100000;

/* ── GSTR-1 Full Summary (outward supplies, from Order) ── */
async function buildGstr1Summary(req) {
  const { from, to } = parseDates(req.query);
  const match = baseMatch(from, to, req.query.storeId);
  const orders = await Order.find(match).select('billing taxType items').lean();

  const blank = () => ({ count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, tax: 0, invoiceAmt: 0 });
  const buckets = {
    b2b: blank(), b2cLarge: blank(), b2cSmall: blank(),
    cdnRegistered: blank(), cdnUnregistered: blank(), exports: blank(), nilRated: blank()
  };

  for (const o of orders) {
    const { nilAmt, taxableAmt } = splitOrderNilVsTaxable(o);
    const bucket = isB2cLargeOrder(o) ? buckets.b2cLarge : buckets.b2cSmall;

    bucket.count += 1;
    bucket.taxable += taxableAmt;
    bucket.cgst += Number(o.billing?.cgst || 0);
    bucket.sgst += Number(o.billing?.sgst || 0);
    bucket.igst += Number(o.billing?.igst || 0);
    bucket.invoiceAmt += Number(o.billing?.grandTotal || 0);

    if (nilAmt > 0) {
      buckets.nilRated.count += 1;
      buckets.nilRated.taxable += nilAmt;
      buckets.nilRated.invoiceAmt += nilAmt; // nil supplies carry no tax
    }
  }

  // b2b / exports / credit-debit notes are always zero here: guest checkout
  // never captures a buyer GSTIN (no B2B sales flow), and there's no
  // export/SEZ sales channel or formal credit-note model in this codebase.
  // Rows are still emitted (not omitted) to match the statutory layout 1:1.
  const order = ['b2b', 'b2cLarge', 'b2cSmall', 'cdnRegistered', 'cdnUnregistered', 'exports', 'nilRated'];
  for (const k of order) {
    const r = buckets[k];
    r.tax = round2(r.cgst + r.sgst + r.igst);
    r.taxable = round2(r.taxable);
    r.cgst = round2(r.cgst); r.sgst = round2(r.sgst); r.igst = round2(r.igst); r.cess = round2(r.cess);
    r.invoiceAmt = round2(r.invoiceAmt);
  }

  const totals = order.reduce((acc, k) => {
    const r = buckets[k];
    return {
      count: acc.count + r.count, taxable: acc.taxable + r.taxable,
      igst: acc.igst + r.igst, cgst: acc.cgst + r.cgst, sgst: acc.sgst + r.sgst,
      cess: acc.cess + r.cess, tax: acc.tax + r.tax, invoiceAmt: acc.invoiceAmt + r.invoiceAmt
    };
  }, { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, tax: 0, invoiceAmt: 0 });
  Object.keys(totals).forEach((k) => { if (k !== 'count') totals[k] = round2(totals[k]); });

  const rows = [
    { sl: 1, particulars: 'B2B Invoices - 4A, 4B, 4C, 6B, 6C', ...buckets.b2b },
    { sl: 2, particulars: 'B2C(Large) Invoices - 5A, 5B', ...buckets.b2cLarge },
    { sl: 3, particulars: 'B2C(Small) Invoices - 7', ...buckets.b2cSmall },
    { sl: 4, particulars: 'Credit/Debit Notes(Registered) - 9B', ...buckets.cdnRegistered },
    { sl: 5, particulars: 'Credit/Debit Notes(Unregistered) - 9B', ...buckets.cdnUnregistered },
    { sl: 6, particulars: 'Exports Invoices - 6A', ...buckets.exports },
    // Advances aren't tracked separately from the order itself, so these two
    // rows have no computable figures — emitted blank, matching the sample.
    { sl: 7, particulars: 'Tax Liability(Advances received) - 11A(1), 11A(2)', notApplicable: true },
    { sl: 8, particulars: 'Adjustment of Advances - 11B(1), 11B(2)', notApplicable: true },
    { sl: 9, particulars: 'Nil Rated Invoices - 8A, 8B, 8C, 8D', ...buckets.nilRated }
  ];

  return {
    reportType: 'GSTR-1', variant: 'Full Summary',
    periodLabel: monthRangeLabel(from, to), period: { from, to },
    rows, totals
  };
}

export const getGstr1Summary = async (req, res) => {
  try {
    res.json({ success: true, data: await buildGstr1Summary(req) });
  } catch (err) {
    console.error('getGstr1Summary:', err);
    res.status(500).json({ success: false, message: 'GSTR-1 summary failed' });
  }
};

/* ── GSTR-2 B2B (inward supplies, from PurchaseInvoice — Phase 3 data) ── */
async function buildGstr2Summary(req) {
  const { from, to } = parseDates(req.query);
  const query = { invoiceDate: { $gte: from, $lte: to }, status: 'active' };
  const invoices = await PurchaseInvoice.find(query).sort({ invoiceDate: 1 }).lean();

  const rows = [];
  for (const inv of invoices) {
    // One vendor invoice can mix line items taxed at different rates; the
    // statutory GSTR-2 register reports taxable value/tax per rate slab, so
    // each distinct gstRate on this invoice becomes its own row.
    const byRate = new Map();
    for (const item of inv.items || []) {
      const rate = Number(item.gstRate || 0);
      byRate.set(rate, (byRate.get(rate) || 0) + Number(item.taxableValue || 0));
    }
    const rateGroups = [...byRate.entries()];
    const invoiceTaxable = rateGroups.reduce((s, [, v]) => s + v, 0) || 1; // guard /0 for cess split below

    rateGroups.forEach(([rate, taxableValue], idx) => {
      const { cgstRate, sgstRate, igstRate } = gstRates(rate, inv.taxType);
      // Cess is captured at invoice level, not per line item (see
      // PurchaseInvoice.js), so it's allocated across this invoice's rate
      // rows in proportion to each row's share of taxable value.
      const cessShare = round2((Number(inv.billing?.cess || 0) * taxableValue) / invoiceTaxable);

      rows.push({
        type: 'Invoice', // no credit/debit-note concept for purchases today
        supplierName: inv.vendor?.name || '',
        supplierGstin: inv.vendor?.gstin || '',
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        // Shown only once per invoice (first rate row), so this column
        // doesn't sum to more than the invoice's actual total.
        invoiceValue: idx === 0 ? round2(inv.billing?.invoiceValue || 0) : null,
        placeOfSupply: inv.placeOfSupply || '',
        reverseCharge: inv.reverseCharge ? 'Yes' : 'No',
        invoiceType: inv.invoiceType,
        rate,
        taxableValue: round2(taxableValue),
        igstPaid: round2((taxableValue * igstRate) / 100),
        cgstPaid: round2((taxableValue * cgstRate) / 100),
        sgstPaid: round2((taxableValue * sgstRate) / 100),
        cessPaid: cessShare
      });
    });
  }

  const totals = rows.reduce((acc, r) => ({
    taxableValue: acc.taxableValue + r.taxableValue,
    igstPaid: acc.igstPaid + r.igstPaid,
    cgstPaid: acc.cgstPaid + r.cgstPaid,
    sgstPaid: acc.sgstPaid + r.sgstPaid,
    cessPaid: acc.cessPaid + r.cessPaid
  }), { taxableValue: 0, igstPaid: 0, cgstPaid: 0, sgstPaid: 0, cessPaid: 0 });
  Object.keys(totals).forEach((k) => { totals[k] = round2(totals[k]); });

  return {
    reportType: 'GSTR-2', variant: 'B2B',
    periodLabel: monthRangeLabel(from, to), period: { from, to },
    rows, totals
  };
}

export const getGstr2Summary = async (req, res) => {
  try {
    res.json({ success: true, data: await buildGstr2Summary(req) });
  } catch (err) {
    console.error('getGstr2Summary:', err);
    res.status(500).json({ success: false, message: 'GSTR-2 summary failed' });
  }
};

/* ── GSTR-3B Full Summary (outward from Order + inward ITC from PurchaseInvoice) ──
   CAUTION: row 4 (Eligible ITC) treats every active purchase invoice's tax as
   fully eligible — s.17(5) blocked-credit rules, invoice/GSTR-2B matching,
   and reverse-charge timing are NOT modelled. "Tax Payable" nets ITC against
   outward tax per head using a simple subtraction — it does NOT apply the
   statutory IGST-first utilisation order (s.49). Both simplifications need
   sign-off from the business's CA before this is used for an actual filing —
   this mirrors the CAUTION already given for Phase 1-3's tax logic. */
async function buildGstr3bSummary(req) {
  const { from, to } = parseDates(req.query);
  const match = baseMatch(from, to, req.query.storeId);
  const orders = await Order.find(match).select('billing taxType items').lean();

  let outA = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
  let outBTaxable = 0;
  let interUnregTaxable = 0;

  for (const o of orders) {
    const { nilAmt, taxableAmt } = splitOrderNilVsTaxable(o);
    outA.taxable += taxableAmt;
    outA.cgst += Number(o.billing?.cgst || 0);
    outA.sgst += Number(o.billing?.sgst || 0);
    outA.igst += Number(o.billing?.igst || 0);
    outBTaxable += nilAmt;
    if (isB2cLargeOrder(o)) interUnregTaxable += taxableAmt; // guest checkout = always unregistered
  }

  const outwardTaxable      = { taxable: round2(outA.taxable), cgst: round2(outA.cgst), sgst: round2(outA.sgst), igst: round2(outA.igst), cess: 0, tax: round2(outA.cgst + outA.sgst + outA.igst) };
  const outwardZeroNilRated = { taxable: round2(outBTaxable), cgst: 0, sgst: 0, igst: 0, cess: 0, tax: 0 };
  const totalOutward = {
    taxable: round2(outwardTaxable.taxable + outwardZeroNilRated.taxable),
    cgst: outwardTaxable.cgst, sgst: outwardTaxable.sgst, igst: outwardTaxable.igst, cess: 0,
    tax: outwardTaxable.tax
  };
  const interstateUnregistered = { taxable: round2(interUnregTaxable) };

  const piMatch = { invoiceDate: { $gte: from, $lte: to }, status: 'active' };
  const [itcAgg] = await PurchaseInvoice.aggregate([
    { $match: piMatch },
    { $group: { _id: null, cgst: { $sum: '$billing.cgst' }, sgst: { $sum: '$billing.sgst' }, igst: { $sum: '$billing.igst' }, cess: { $sum: '$billing.cess' } } }
  ]);
  const eligibleItc = {
    cgst: round2(itcAgg?.cgst || 0), sgst: round2(itcAgg?.sgst || 0),
    igst: round2(itcAgg?.igst || 0), cess: round2(itcAgg?.cess || 0)
  };

  const invoicesForRow5 = await PurchaseInvoice.find(piMatch).select('items').lean();
  let row5Taxable = 0;
  for (const inv of invoicesForRow5) {
    for (const item of inv.items || []) {
      if (Number(item.gstRate || 0) === 0) row5Taxable += Number(item.taxableValue || 0);
    }
  }
  const exemptNilNonGstInward = { taxable: round2(row5Taxable) };

  const taxPayable = {
    igst: round2(Math.max(0, totalOutward.igst - eligibleItc.igst)),
    cgst: round2(Math.max(0, totalOutward.cgst - eligibleItc.cgst)),
    sgst: round2(Math.max(0, totalOutward.sgst - eligibleItc.sgst)),
    cess: round2(Math.max(0, totalOutward.cess - eligibleItc.cess))
  };
  taxPayable.tax = round2(taxPayable.igst + taxPayable.cgst + taxPayable.sgst + taxPayable.cess);

  return {
    reportType: 'GSTR-3B', variant: 'Full Summary',
    periodLabel: monthRangeLabel(from, to), period: { from, to },
    rows: { outwardTaxable, outwardZeroNilRated, totalOutward, interstateUnregistered, eligibleItc, exemptNilNonGstInward, taxPayable }
  };
}

export const getGstr3bSummary = async (req, res) => {
  try {
    res.json({ success: true, data: await buildGstr3bSummary(req) });
  } catch (err) {
    console.error('getGstr3bSummary:', err);
    res.status(500).json({ success: false, message: 'GSTR-3B summary failed' });
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   PHASE 4 — EXPORT (PDF / XLSX) FOR THE THREE SUMMARY REPORTS

   Flattens each builder's structured output into the exact row/column shape
   of the sample reports, then renders it either as an .xlsx (via the shared
   rowsToXlsxBuffer helper) or as a styled landscape-A4 PDF matching the
   samples' look: centered bold "SAGONA" title, left-aligned subtitle with
   report name + period, dark navy header row, shaded total row.
═══════════════════════════════════════════════════════════════════════ */
const NAVY = '#1f3a5f';

function summaryToRowsForGstr1(summary) {
  const headers = ['SI No.', 'Particulars', 'Voucher Count', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State Tax Amount', 'Cess Amount', 'Tax Amount', 'Invoice Amount'];
  const rows = summary.rows.map((r) => ([
    r.sl,
    r.particulars,
    r.notApplicable ? '-' : r.count,
    r.notApplicable ? '-' : INR(r.taxable),
    r.notApplicable ? '-' : INR(r.igst),
    r.notApplicable ? '-' : INR(r.cgst),
    r.notApplicable ? '-' : INR(r.sgst),
    r.notApplicable ? '-' : INR(r.cess),
    r.notApplicable ? '-' : INR(r.tax),
    r.notApplicable ? '-' : INR(r.invoiceAmt)
  ]));
  const t = summary.totals;
  rows.push(['', 'Total', t.count, INR(t.taxable), INR(t.igst), INR(t.cgst), INR(t.sgst), INR(t.cess), INR(t.tax), INR(t.invoiceAmt)]);
  return { headers, rows };
}

function summaryToRowsForGstr2(summary) {
  const headers = ['Type', 'Supplier-Party Name', 'GSTIN of Supplier-Party', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Invoice Type', 'Rate', 'Taxable Value', 'Integrated Tax Paid', 'Central Tax Paid', 'State-UT Tax Paid', 'Cess Paid'];
  const rows = summary.rows.map((r) => ([
    r.type,
    r.supplierName,
    r.supplierGstin,
    r.invoiceNumber,
    r.invoiceDate ? new Date(r.invoiceDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
    r.invoiceValue !== null ? INR(r.invoiceValue) : '',
    r.placeOfSupply,
    r.reverseCharge,
    r.invoiceType,
    r.rate,
    INR(r.taxableValue),
    INR(r.igstPaid),
    INR(r.cgstPaid),
    INR(r.sgstPaid),
    INR(r.cessPaid)
  ]));
  const t = summary.totals;
  rows.push(['', '', '', '', '', '', '', '', '', 'Total', INR(t.taxableValue), INR(t.igstPaid), INR(t.cgstPaid), INR(t.sgstPaid), INR(t.cessPaid)]);
  return { headers, rows };
}

function summaryToRowsForGstr3b(summary) {
  const headers = ['Table No.', 'Particulars', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State Tax Amount', 'Cess Amount', 'Tax Amount'];
  const r = summary.rows;
  const rows = [
    ['(a)', 'Outward taxable supplies (other than zero rated, nil rated and exempted)', INR(r.outwardTaxable.taxable), INR(r.outwardTaxable.igst), INR(r.outwardTaxable.cgst), INR(r.outwardTaxable.sgst), INR(r.outwardTaxable.cess), INR(r.outwardTaxable.tax)],
    ['(b)', 'Other outward supplies (Nil rated, exempted)', INR(r.outwardZeroNilRated.taxable), INR(r.outwardZeroNilRated.igst), INR(r.outwardZeroNilRated.cgst), INR(r.outwardZeroNilRated.sgst), INR(r.outwardZeroNilRated.cess), INR(r.outwardZeroNilRated.tax)],
    ['3.1', 'Total Outward Supplies (a + b)', INR(r.totalOutward.taxable), INR(r.totalOutward.igst), INR(r.totalOutward.cgst), INR(r.totalOutward.sgst), INR(r.totalOutward.cess), INR(r.totalOutward.tax)],
    ['3.2', 'Inter-State supplies to Unregistered Persons', INR(r.interstateUnregistered.taxable), '-', '-', '-', '-', '-'],
    ['4', 'Eligible ITC', '-', INR(r.eligibleItc.igst), INR(r.eligibleItc.cgst), INR(r.eligibleItc.sgst), INR(r.eligibleItc.cess), '-'],
    ['5', 'Exempt, Nil and Non-GST inward supplies', INR(r.exemptNilNonGstInward.taxable), '-', '-', '-', '-', '-'],
    ['', 'Tax Payable', '-', INR(r.taxPayable.igst), INR(r.taxPayable.cgst), INR(r.taxPayable.sgst), INR(r.taxPayable.cess), INR(r.taxPayable.tax)]
  ];
  return { headers, rows };
}

function renderSummaryTablePdf(res, { subtitle, headers, rows, fname }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  res.setHeader('Content-Disposition', `attachment; filename="${fname}.pdf"`);
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);

  const pageWidth = doc.page.width - 60;
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#111111')
     .text('SAGONA', 30, 22, { width: pageWidth, align: 'center' });
  doc.fontSize(10).font('Helvetica').fillColor('#333333')
     .text(subtitle, 30, 46, { width: pageWidth, align: 'left' });

  const colW = Math.floor(pageWidth / headers.length);
  let y = 70;
  const rowH = 18;

  const drawRow = (cells, opts = {}) => {
    const { header = false, total = false } = opts;
    if (header) {
      doc.rect(30, y, pageWidth, rowH).fill(NAVY);
      doc.fillColor('#ffffff').font('Helvetica-Bold');
    } else if (total) {
      doc.rect(30, y, pageWidth, rowH).fill('#dfe6ee');
      doc.fillColor('#111111').font('Helvetica-Bold');
    } else {
      doc.fillColor('#111111').font('Helvetica');
    }
    doc.fontSize(7);
    cells.forEach((c, i) => {
      doc.text(String(c ?? ''), 30 + i * colW + 3, y + 5, { width: colW - 6, ellipsis: true });
    });
    y += rowH;
  };

  drawRow(headers, { header: true });
  rows.forEach((r, idx) => {
    if (y > doc.page.height - 50) {
      doc.addPage();
      y = 40;
      drawRow(headers, { header: true });
    }
    drawRow(r, { total: idx === rows.length - 1 });
  });

  doc.end();
}

export const exportGstSummary = async (req, res) => {
  try {
    const reportType = (req.query.reportType || 'gstr1').toLowerCase();
    const format = (req.query.format || 'pdf').toLowerCase();

    let summary, rowsData, sheetName, reportLabel;
    if (reportType === 'gstr2') {
      summary = await buildGstr2Summary(req);
      rowsData = summaryToRowsForGstr2(summary);
      sheetName = 'GSTR2'; reportLabel = 'GSTR2 Report - B2B';
    } else if (reportType === 'gstr3b') {
      summary = await buildGstr3bSummary(req);
      rowsData = summaryToRowsForGstr3b(summary);
      sheetName = 'GSTR3B'; reportLabel = 'GSTR3B Report - Full Summary';
    } else {
      summary = await buildGstr1Summary(req);
      rowsData = summaryToRowsForGstr1(summary);
      sheetName = 'GSTR1'; reportLabel = 'GSTR1 Report - Full Summary';
    }

    const subtitle = `${reportLabel} (${summary.periodLabel})`;
    const fromStr = new Date(summary.period.from).toISOString().slice(0, 10);
    const toStr   = new Date(summary.period.to).toISOString().slice(0, 10);
    const fname   = `sagona_${sheetName.toLowerCase()}_${fromStr}_${toStr}`;

    if (format === 'xlsx') {
      const objRows = rowsData.rows.map((r) => {
        const obj = {};
        rowsData.headers.forEach((h, i) => { obj[h] = r[i]; });
        return obj;
      });
      const buffer = await rowsToXlsxBuffer(objRows, sheetName);
      res.setHeader('Content-Disposition', `attachment; filename="${fname}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }

    if (format === 'pdf') {
      return renderSummaryTablePdf(res, { subtitle, headers: rowsData.headers, rows: rowsData.rows, fname });
    }

    res.status(400).json({ success: false, message: 'format must be pdf or xlsx' });
  } catch (err) {
    console.error('exportGstSummary:', err);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
};

/* ═══════════════════════════════════
   HSN SUMMARY
═══════════════════════════════════ */
export const getHsnSummary = async (req, res) => {
  try {
    const { from, to } = parseDates(req.query);
    const match = baseMatch(from, to, req.query.storeId);

    const rows = await computeHsnRows(match);

    const formatted = rows.map((r) => ({
      hsnCode:     r.hsnCode,
      description: r.description,
      taxType:     r.taxType,
      totalQty:    r.totalQty,
      taxableAmt:  INR(r.taxableAmt),
      cgst:        INR(r.cgst),
      sgst:        INR(r.sgst),
      igst:        INR(r.igst),
      totalTax:    INR(r.totalTax)
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
      const raw = await computeHsnRows(match);
      rows = raw.map((r) => ({
        'HSN Code':       r.hsnCode,
        'Description':    r.description,
        'Tax Type':       r.taxType,
        'Total Qty':      r.totalQty,
        'Taxable Amount': Number(INR(r.taxableAmt)),
        'CGST':           Number(INR(r.cgst)),
        'SGST':           Number(INR(r.sgst)),
        'IGST':           Number(INR(r.igst)),
        'Total Tax':      Number(INR(r.totalTax))
      }));
    } else {
      // Invoice register rows
      const invoices = await Order.find(match)
        .select('orderNumber customer shippingAddress billing taxType createdAt payment')
        .sort({ createdAt: 1 }).lean();

      rows = invoices.map((o) => ({
        'Invoice No':      o.orderNumber,
        'Date':            new Date(o.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
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
      const buffer = await rowsToXlsxBuffer(rows, type.toUpperCase());

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

    const buffer = await rowsToXlsxBuffer(rows, 'Consolidated');
    const fname  = `sagona_consolidated_${new Date(from).toISOString().slice(0, 10)}_${new Date(to).toISOString().slice(0, 10)}`;

    res.setHeader('Content-Disposition', `attachment; filename="${fname}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('getConsolidated:', err);
    res.status(500).json({ success: false, message: 'Consolidated report failed' });
  }
};
