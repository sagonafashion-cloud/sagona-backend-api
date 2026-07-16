import Product from '../models/Product.js';
import Store from '../models/Store.js';
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
    const product = await Product.findOne({ _id: item.productId, status: 'active' });
    if (!product) {
      const err = new Error(`Product ${item.productId} not found`);
      err.statusCode = 400;
      throw err;
    }

    const unitPrice = product.price;
    const qty = Number(item.qty || item.quantity || 1);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 20) {
      const err = new Error('Quantity must be a whole number between 1 and 20');
      err.statusCode = 400;
      throw err;
    }

    // If variants are configured, require and validate the selected variant.
    // This prevents orders for nonexistent/out-of-stock size/colour combinations.
    if (product.variants?.length) {
      const variant = product.variants.find((v) =>
        v.size === item.size && String(v.colour || '').toLowerCase() === String(item.colour || '').toLowerCase()
      );
      if (!variant || variant.stock < qty) {
        const err = new Error('Selected product variant is unavailable');
        err.statusCode = 400;
        throw err;
      }
    }

    let storeState = '';
    if (item.storeId) {
      const store = await Store.findOne({ _id: item.storeId, isActive: true }).select('state').lean();
      if (!store) {
        const err = new Error('Selected fulfilment store is unavailable');
        err.statusCode = 400;
        throw err;
      }
      storeState = store.state || '';
    }

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
      storeId: item.storeId,
      storeState
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
