import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';

// Adds an order's items back to inventory — exactly once per order.
// The claim (setting stockRestoredAt) and the stock increments happen in one
// transaction, so either both apply or neither does, and a second call (double
// click, retry, cancel-then-return) finds the claim taken and does nothing.
// Uses the same stock fields checkout decrements (top-level stock for
// non-variant items, variants.$.stock otherwise).
export async function restoreOrderStock(orderId) {
  const session = await mongoose.startSession();
  let restored = false;
  try {
    await session.withTransaction(async () => {
      restored = false;
      const order = await Order.findOneAndUpdate(
        { _id: orderId, stockRestoredAt: null },
        { $set: { stockRestoredAt: new Date() } },
        { session, new: true }
      );
      if (!order) return; // already restored (or order missing)

      for (const item of order.items || []) {
        if (!item.productId || !(item.qty > 0)) continue; // manual orders may have no product link
        if (!item.size && !item.colour) {
          await Product.updateOne({ _id: item.productId }, { $inc: { stock: item.qty } }, { session });
        } else {
          await Product.updateOne(
            { _id: item.productId, variants: { $elemMatch: { size: item.size, colour: item.colour } } },
            { $inc: { 'variants.$.stock': item.qty } },
            { session }
          );
        }
      }
      restored = true;
    });
  } finally {
    session.endSession();
  }
  return restored;
}

// Marks returned goods as awaiting inspection (no stock change). No-op if the
// order already has a stock decision.
export async function holdReturnedStock(orderId) {
  await Order.updateOne({ _id: orderId, returnStockStatus: null, stockRestoredAt: null }, { $set: { returnStockStatus: 'held' } });
}
