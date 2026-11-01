// Pure commission-lifecycle logic. Given an order, its referral lines and the ledger
// entries that already exist, work out which NEW entries must be appended. No I/O, so
// it is fully unit-testable and idempotent: running it twice yields nothing the second time.

const DAY_MS = 86400000;

export const pendingAccrualEntry = (line, eventAt) => ({
  promoterId: line.promoterId, orderId: line.orderId, orderReferralLineId: line._id,
  entryType: 'accrual_pending', bucket: 'pending', amountPaise: line.commissionPaise,
  reason: 'Order placed', eventAt, actor: 'system', idempotencyKey: `${line._id}:accrual_pending`
});

/** When the customer actually received the goods (admin-marked "delivered"). */
export function deliveredAt(order) {
  const fromTimeline = (order.timeline || [])
    .filter((t) => t.status === 'delivered' && t.timestamp)
    .map((t) => new Date(t.timestamp).getTime());
  const fromShipments = (order.shipments || [])
    .filter((s) => s.deliveredAt)
    .map((s) => new Date(s.deliveredAt).getTime());
  const all = [...fromTimeline, ...fromShipments];
  return all.length ? new Date(Math.max(...all)) : null;
}

const sum = (entries, f) => entries.filter(f).reduce((s, e) => s + e.amountPaise, 0);

/**
 * @param {object} p
 *  p.lines    [{_id,promoterId,orderId,commissionPaise}]
 *  p.existing ledger rows already written for these lines
 *  p.order    {status,timeline,shipments}
 *  p.windowDays  return window (days after delivery)
 *  p.held     true when a fraud flag is open => never make eligible
 *  p.now      Date
 * @returns {{ entries: object[], outcome: string }}
 */
export function deriveSweepEntries({ lines, existing, order, windowDays, held = false, now = new Date() }) {
  const entries = [];
  let outcome = 'none';

  for (const line of lines) {
    const mine = existing.filter((e) => String(e.orderReferralLineId) === String(line._id));
    const has = (type) => mine.some((e) => e.entryType === type);
    const commission = line.commissionPaise;
    if (!commission || !has('accrual_pending')) continue;      // nothing earned / not accrued yet

    const base = { promoterId: line.promoterId, orderId: line.orderId, orderReferralLineId: line._id, eventAt: now, actor: 'system' };
    const reversed = -sum(mine, (e) => e.entryType.startsWith('reversal_'));
    const eligible = has('accrual_eligible');

    // 1. Cancelled / returned => claw back whatever has not been reversed yet.
    if (['cancelled', 'returned'].includes(order.status)) {
      const toReverse = commission - reversed;
      if (toReverse > 0) {
        entries.push({
          ...base,
          entryType: order.status === 'cancelled' ? 'reversal_cancel' : 'reversal_return',
          bucket: eligible ? 'payable' : 'pending',               // reverse in the bucket where the money sits
          amountPaise: -toReverse,
          reason: `Order ${order.status}`,
          idempotencyKey: `${line._id}:reversal`
        });
        outcome = 'reversed';
      }
      continue;
    }

    // 2. Delivered, window over, no return requested, not held => becomes payable.
    if (order.status === 'delivered' && !eligible && reversed === 0 && !held) {
      const at = deliveredAt(order);
      if (at && now.getTime() >= at.getTime() + windowDays * DAY_MS) {
        entries.push(
          { ...base, entryType: 'release_pending', bucket: 'pending', amountPaise: -commission, reason: 'Return window over', idempotencyKey: `${line._id}:release` },
          { ...base, entryType: 'accrual_eligible', bucket: 'payable', amountPaise: commission, reason: 'Return window over', idempotencyKey: `${line._id}:eligible` }
        );
        outcome = 'eligible';
      }
    }
    // 3. Anything else (placed, shipped, return_requested ...) => wait.
  }
  return { entries, outcome };
}

/** Balance of a set of ledger rows, by bucket. */
export function balances(rows) {
  return rows.reduce((b, r) => { b[r.bucket] = (b[r.bucket] || 0) + r.amountPaise; return b; }, { pending: 0, payable: 0 });
}
