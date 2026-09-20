/**
 * GST Tax Calculator — India rules, GST-INCLUSIVE pricing model.
 *
 * Product prices (unitPrice) are treated as GST-inclusive — the customer is
 * charged exactly unitPrice × qty, with NO GST added on top. GST is derived
 * backwards out of that price purely for compliance/invoicing purposes:
 *   taxableValue = price / (1 + gstSlab/100)
 *   gstAmount    = price - taxableValue
 *
 * Intra-state (same state): the derived gstAmount splits into CGST + SGST (half each)
 * Inter-state (different states): the derived gstAmount is all IGST
 *
 * This is the SINGLE shared helper — invoiceGenerator.js, gstController.js and
 * any other consumer must call splitInclusivePrice() rather than re-deriving
 * the tax split independently, or the numbers will drift.
 *
 * @param {number} lineTotal — GST-inclusive amount actually charged for this line (unitPrice * qty)
 * @param {number} gstSlab   — this product's own GST rate, e.g. 5, 12, 18 (never a flat assumed rate)
 * @param {'intra'|'inter'} taxType
 * @returns {{ taxableAmt, gstAmount, cgst, sgst, igst }}
 */
export function splitInclusivePrice(lineTotal, gstSlab, taxType) {
  const rate = Number(gstSlab || 0);
  const amount = Number(lineTotal || 0);

  const taxableAmt = rate > 0 ? amount / (1 + rate / 100) : amount;
  const gstAmount   = amount - taxableAmt;

  let cgst = 0, sgst = 0, igst = 0;
  if (rate > 0) {
    if (taxType === 'intra') {
      cgst = round2(gstAmount / 2);
      sgst = cgst;
    } else {
      igst = round2(gstAmount);
    }
  }

  return { taxableAmt: round2(taxableAmt), gstAmount: round2(gstAmount), cgst, sgst, igst };
}

/**
 * @param {Array}  lineItems    — order items with { unitPrice, qty, gstSlab, mrp, ... }
 * @param {string} storeState   — state of dispatching store (e.g. "Rajasthan")
 * @param {string} customerState — state from shipping address
 * @returns {{ taxType, processedItems, subtotal, discount, taxableAmount, cgst, sgst, igst, grandTotal }}
 */
export function calculateTax(lineItems, storeState, customerState) {
  const taxType =
    storeState && customerState &&
    storeState.trim().toLowerCase() === customerState.trim().toLowerCase()
      ? 'intra'
      : 'inter';

  let subtotal      = 0; // GST-inclusive amount actually charged — this IS the grand total (before shipping)
  let totalDiscount = 0;
  let totalTaxable  = 0;
  let totalCgst     = 0;
  let totalSgst     = 0;
  let totalIgst     = 0;

  const processedItems = lineItems.map((item) => {
    const qty        = Number(item.qty || 1);
    const unitPrice  = Number(item.unitPrice || 0);
    const mrp        = Number(item.mrp || unitPrice);
    const gstSlab    = Number(item.gstSlab || 0);

    const lineTotal = unitPrice * qty; // price is GST-inclusive — this is what's charged
    const discount  = Math.max(0, (mrp - unitPrice) * qty);

    const { taxableAmt, gstAmount, cgst, sgst, igst } = splitInclusivePrice(lineTotal, gstSlab, taxType);

    subtotal      += lineTotal;
    totalDiscount += discount;
    totalTaxable  += taxableAmt;
    totalCgst     += cgst;
    totalSgst     += sgst;
    totalIgst     += igst;

    return {
      ...item,
      lineTotal: round2(lineTotal),
      taxableAmount: taxableAmt,
      gstAmount,
      discount: round2(discount),
      cgst, sgst, igst
    };
  });

  const taxableAmount = round2(totalTaxable);
  // Price is already GST-inclusive — grand total is just the sum of item prices.
  // GST (cgst/sgst/igst) is informational/derived, NOT added on top.
  const grandTotal = round2(subtotal);

  return {
    taxType,
    processedItems,
    subtotal:      round2(subtotal),
    discount:      round2(totalDiscount),
    taxableAmount,
    cgst:          round2(totalCgst),
    sgst:          round2(totalSgst),
    igst:          round2(totalIgst),
    totalTax:      round2(totalCgst + totalSgst + totalIgst),
    grandTotal
  };
}

/**
 * Convenience: compute effective GST slab percentages for display.
 * @param {number} gstSlab  — e.g. 12
 * @param {'intra'|'inter'} taxType
 * @returns {{ cgstRate, sgstRate, igstRate }}
 */
export function gstRates(gstSlab, taxType) {
  if (taxType === 'intra') {
    return { cgstRate: gstSlab / 2, sgstRate: gstSlab / 2, igstRate: 0 };
  }
  return { cgstRate: 0, sgstRate: 0, igstRate: gstSlab };
}

const round2 = (n) => Math.round(n * 100) / 100;
