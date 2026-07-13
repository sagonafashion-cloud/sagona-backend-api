import Product from '../models/Product.js';
import { calculateTax } from './taxCalculator.js';

/**
 * Recomputes order items and billing entirely from trusted server-side data
 * (product prices, GST slabs) — never from client-supplied prices/amounts.
 */
export async function computeOrderTotals(items = [], shippingAddress = {}) {
  if (!items.length) {
    const err = new Error('Order items required');
    err.statusCode = 400;
    throw err;
  }

  const enrichedItems = [];

  for (const item of items) {
    const product = await Product.findById(item.productId);
    if (!product) {
      const err = new Error(`Product ${item.productId} not found`);
      err.statusCode = 400;
      throw err;
    }

    const unitPrice = product.price;
    const qty = Number(item.qty || item.quantity || 1);

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

  const subtotalRaw = enrichedItems.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const shippingCharge = subtotalRaw >= (Number(process.env.FREE_SHIPPING_THRESHOLD) || 999) ? 0 : 99;

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

  return { enrichedItems, billing, taxType: tax.taxType };
}
