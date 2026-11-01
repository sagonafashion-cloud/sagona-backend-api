// Pure report and reconciliation calculations over already-loaded rows (integer paise).
// No I/O: the controller loads the rows, these functions only add things up, so every number
// can be traced to ledger/order rows and is unit-tested.

const INACTIVE = new Set(['cancelled', 'returned']);
const rec = () => ({ orders: 0, listPaise: 0, discountPaise: 0, taxablePaise: 0, gstPaise: 0, commissionPaise: 0 });
const statusOf = (orders, id) => orders.get(String(id))?.status;
const active = (orders, id) => !INACTIVE.has(statusOf(orders, id));
const inRange = (d, from, to) => (!from || new Date(d) >= new Date(from)) && (!to || new Date(d) < new Date(to));

/** What Sagona owes promoters, split by state. */
export function liabilityReport({ ledger, items, names }) {
  const by = new Map();
  const get = (id) => { const k = String(id); if (!by.has(k)) by.set(k, { promoterId: k, name: names.get(k) || k, pendingPaise: 0, payablePaise: 0, reservedPaise: 0, paidPaise: 0 }); return by.get(k); };
  for (const r of ledger) get(r.promoterId)[r.bucket === 'pending' ? 'pendingPaise' : 'payablePaise'] += r.amountPaise;
  for (const i of items) {
    if (i.status === 'approved') get(i.promoterId).reservedPaise += i.grossPaise;      // approved, bank transfer not confirmed yet
    if (i.status === 'paid') get(i.promoterId).paidPaise += i.grossPaise;
  }
  const rows = [...by.values()].map((r) => ({ ...r, owedPaise: r.pendingPaise + r.payablePaise + r.reservedPaise }));
  const total = rows.reduce((t, r) => { for (const k of ['pendingPaise', 'payablePaise', 'reservedPaise', 'paidPaise', 'owedPaise']) t[k] += r[k]; return t; },
    { pendingPaise: 0, payablePaise: 0, reservedPaise: 0, paidPaise: 0, owedPaise: 0 });
  return { rows, total };
}

/** Programme totals for a period. Cancelled/returned orders are counted separately, not as sales. */
export function programmeSummary({ refs, lines, orders, from, to }) {
  const sel = refs.filter((r) => inRange(r.createdAt, from, to));
  const ids = new Set(sel.map((r) => String(r._id)));
  const t = rec(); let cancelled = 0;
  const cat = {};
  for (const r of sel) if (!active(orders, r.orderId)) cancelled++; else t.orders++;
  for (const l of lines) {
    if (!ids.has(String(l.orderReferralId)) || !active(orders, l.orderId)) continue;
    t.listPaise += l.lineGrossPaise; t.discountPaise += l.lineDiscountPaise; t.taxablePaise += l.lineTaxablePaise; t.gstPaise += l.lineGstPaise; t.commissionPaise += l.commissionPaise;
    const c = (cat[l.category || 'other'] ||= rec());
    c.listPaise += l.lineGrossPaise; c.discountPaise += l.lineDiscountPaise; c.taxablePaise += l.lineTaxablePaise; c.gstPaise += l.lineGstPaise; c.commissionPaise += l.commissionPaise;
  }
  const costPct = t.listPaise ? ((t.discountPaise + t.commissionPaise) / t.listPaise) * 100 : 0;
  return { ...t, cancelledOrReturned: cancelled, programmeCostPct: Math.round(costPct * 100) / 100, byCategory: cat };
}

/** Effect of the trade discount on GST: the taxable value and GST the store reports are lower by these amounts. */
export function gstImpact({ refs, lines, orders, from, to }) {
  const ids = new Set(refs.filter((r) => inRange(r.createdAt, from, to)).map((r) => String(r._id)));
  const byRate = {};
  for (const l of lines) {
    if (!ids.has(String(l.orderReferralId)) || !active(orders, l.orderId)) continue;
    const k = String(l.gstRate ?? 0);
    const x = (byRate[k] ||= { gstRate: l.gstRate ?? 0, taxablePaise: 0, gstPaise: 0, discountPaise: 0, taxableReductionPaise: 0, gstReductionPaise: 0 });
    x.taxablePaise += l.lineTaxablePaise; x.gstPaise += l.lineGstPaise; x.discountPaise += l.lineDiscountPaise;
    const exGst = Math.round((l.lineDiscountPaise * 100) / (100 + (l.gstRate || 0)));
    x.taxableReductionPaise += exGst; x.gstReductionPaise += l.lineDiscountPaise - exGst;
  }
  const rows = Object.values(byRate).sort((a, b) => a.gstRate - b.gstRate);
  const total = rows.reduce((t, r) => { for (const k of Object.keys(r)) if (k !== 'gstRate') t[k] = (t[k] || 0) + r[k]; return t; }, {});
  return { rows, total };
}

export function promoterPerformance({ refs, lines, orders, names, from, to }) {
  const sel = refs.filter((r) => inRange(r.createdAt, from, to));
  const by = new Map();
  const get = (id) => { const k = String(id); if (!by.has(k)) by.set(k, { promoterId: k, name: names.get(k) || k, orders: 0, delivered: 0, cancelledOrReturned: 0, discountPaise: 0, commissionPaise: 0 }); return by.get(k); };
  const commissionByRef = new Map();
  for (const l of lines) commissionByRef.set(String(l.orderReferralId), (commissionByRef.get(String(l.orderReferralId)) || 0) + l.commissionPaise);
  for (const r of sel) {
    const p = get(r.promoterId); p.orders++;
    const st = statusOf(orders, r.orderId);
    if (st === 'delivered') p.delivered++;
    if (INACTIVE.has(st)) p.cancelledOrReturned++;
    else { p.discountPaise += r.discountTotalPaise; p.commissionPaise += commissionByRef.get(String(r._id)) || 0; }
  }
  return [...by.values()].map((p) => ({ ...p, returnRatePct: p.orders ? Math.round((p.cancelledOrReturned / p.orders) * 10000) / 100 : 0 }))
    .sort((a, b) => b.commissionPaise - a.commissionPaise);
}

/**
 * Margin after the programme. `costByProduct`: productId -> buying cost per unit in paise (ex-GST, as
 * entered in the admin). Lines whose product has no cost are reported as `unknownCostPaise`, never guessed.
 */
export function profitReport({ refs, lines, orders, costByProduct, from, to }) {
  const ids = new Set(refs.filter((r) => inRange(r.createdAt, from, to)).map((r) => String(r._id)));
  const t = { taxablePaise: 0, costPaise: 0, commissionPaise: 0, unknownCostPaise: 0 };
  for (const l of lines) {
    if (!ids.has(String(l.orderReferralId)) || !active(orders, l.orderId)) continue;
    const unit = costByProduct.get(String(l.productId));
    if (unit == null) { t.unknownCostPaise += l.lineTaxablePaise; continue; }
    t.taxablePaise += l.lineTaxablePaise; t.costPaise += unit * l.qty; t.commissionPaise += l.commissionPaise;
  }
  const marginPaise = t.taxablePaise - t.costPaise - t.commissionPaise;
  return { ...t, marginPaise, marginPct: t.taxablePaise ? Math.round((marginPaise / t.taxablePaise) * 10000) / 100 : 0 };
}

/**
 * Integrity checks. Each returns { check, ok, count, samples[] }. Anything not ok needs a human look.
 * `tolerancePaise` absorbs the pre-existing +-2 paise per-line rounding in legacy order billing.
 */
export function reconcile({ refs, lines, ledger, orders, payoutItems, codes, codeUseCounts, tolerancePaise = 2 }) {
  const out = [];
  const add = (check, bad) => out.push({ check, ok: bad.length === 0, count: bad.length, samples: bad.slice(0, 5) });
  const linesBy = new Map();
  for (const l of lines) { const k = String(l.orderReferralId); (linesBy.get(k) || linesBy.set(k, []).get(k)).push(l); }
  const ledgerByLine = new Map();
  for (const e of ledger) if (e.orderReferralLineId) { const k = String(e.orderReferralLineId); (ledgerByLine.get(k) || ledgerByLine.set(k, []).get(k)).push(e); }

  // 1. Order-level totals equal the sum of their lines.
  add('Order discount/commission totals equal the sum of their lines', refs.filter((r) => {
    const ls = linesBy.get(String(r._id)) || [];
    return ls.reduce((s, l) => s + l.lineDiscountPaise, 0) !== r.discountTotalPaise || ls.reduce((s, l) => s + l.commissionPaise, 0) !== r.commissionTotalPaise;
  }).map((r) => r.orderNumber || String(r.orderId)));

  // 2. Every commissioned line has exactly its accrual in the ledger.
  add('Every commissioned line has a matching accrual in the ledger', lines.filter((l) => {
    if (!l.commissionPaise) return false;
    const acc = (ledgerByLine.get(String(l._id)) || []).filter((e) => e.entryType === 'accrual_pending').reduce((s, e) => s + e.amountPaise, 0);
    return acc !== l.commissionPaise;
  }).map((l) => String(l.orderId)));

  // 3. Discount recorded on the order equals the referral snapshot.
  add('Discount on the order matches the referral record', refs.filter((r) => {
    const o = orders.get(String(r.orderId)); if (!o) return true;
    return Math.abs(Math.round((o.billing?.referralDiscount || 0) * 100) - r.discountTotalPaise) > tolerancePaise;
  }).map((r) => r.orderNumber || String(r.orderId)));

  // 4. No promoter bucket is negative (would mean paying out more than earned).
  const bal = new Map();
  for (const e of ledger) { const k = `${e.promoterId}|${e.bucket}`; bal.set(k, (bal.get(k) || 0) + e.amountPaise); }
  add('No promoter has a negative pending or payable balance', [...bal.entries()].filter(([, v]) => v < 0).map(([k]) => k));

  // 5. Released money moved between buckets without loss: release_pending = -accrual_eligible per line.
  add('Pending-to-payable releases balance to zero per line', [...ledgerByLine.entries()].filter(([, es]) => {
    const rel = es.filter((e) => e.entryType === 'release_pending').reduce((s, e) => s + e.amountPaise, 0);
    const elig = es.filter((e) => e.entryType === 'accrual_eligible').reduce((s, e) => s + e.amountPaise, 0);
    return rel + elig !== 0;
  }).map(([k]) => k));

  // 6. Payout ledger entries equal approved/paid payout items.
  const reserved = ledger.filter((e) => e.entryType === 'payout' || e.entryType === 'payout_void').reduce((s, e) => s + e.amountPaise, 0);
  const itemSum = payoutItems.filter((i) => ['approved', 'paid'].includes(i.status)).reduce((s, i) => s + i.grossPaise, 0);
  add('Payout ledger entries equal approved + paid payout items', reserved + itemSum === 0 ? [] : [`ledger ${reserved} vs items ${itemSum}`]);

  // 7. Code usage counter equals referral records.
  add('Code usage counters equal referral records', codes.filter((c) => (codeUseCounts.get(String(c._id)) || 0) !== (c.timesUsed || 0)).map((c) => c.code));

  // 8. Cancelled/returned orders carry no un-reversed commission.
  add('Cancelled or returned orders have no commission left unreversed', lines.filter((l) => {
    if (!l.commissionPaise || active(orders, l.orderId)) return false;
    const es = ledgerByLine.get(String(l._id)) || [];
    if (!es.length) return false;
    return es.some((e) => e.entryType === 'accrual_pending') && !es.some((e) => e.entryType.startsWith('reversal_'));   // normal for up to one sweep interval (6h)
  }).map((l) => String(l.orderId)));

  return out;
}
