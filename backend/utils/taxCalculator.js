/**
 * GST Tax Calculator — India rules
 *
 * Intra-state (same state): CGST + SGST, each = gstSlab / 2
 * Inter-state (different states): IGST = full gstSlab
 *
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

  let subtotal      = 0;
  let totalDiscount = 0;
  let totalCgst     = 0;
  let totalSgst     = 0;
  let totalIgst     = 0;

  const processedItems = lineItems.map((item) => {
    const qty        = Number(item.qty || 1);
    const unitPrice  = Number(item.unitPrice || 0);
    const mrp        = Number(item.mrp || unitPrice);
    const gstSlab    = Number(item.gstSlab || 0);

    const lineTotal    = unitPrice * qty;
    const discount     = Math.max(0, (mrp - unitPrice) * qty);
    const taxableAmt   = lineTotal; // GST is on actual selling price

    subtotal      += lineTotal;
    totalDiscount += discount;

    let cgst = 0, sgst = 0, igst = 0;
    if (gstSlab > 0) {
      if (taxType === 'intra') {
        cgst = round2((taxableAmt * gstSlab) / 200);
        sgst = cgst;
      } else {
        igst = round2((taxableAmt * gstSlab) / 100);
      }
    }

    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;

    return { ...item, taxableAmount: round2(taxableAmt), discount: round2(discount), cgst, sgst, igst };
  });

  const taxableAmount = round2(subtotal);
  const grandTotal    = round2(subtotal + totalCgst + totalSgst + totalIgst);

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
