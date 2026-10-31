// Pure commission-rate and margin-guard logic (no database access).

/**
 * Pick the commission rate (basis points) that applies at a point in time.
 * Rows are insert-only history; the latest row whose effectiveFrom <= `at` wins
 * within each tier. Tier order:
 *   1. promoter + category override
 *   2. promoter override for all categories
 *   3. category default (no promoter)
 *   4. global default (no promoter, no category)
 * Returns null when nothing applies (caller treats this as 0% and flags the order).
 */
export function pickRate(rows, { category = null, promoterId = null, at = new Date() } = {}) {
  const t = new Date(at).getTime();
  const eligible = (rows || []).filter((r) => new Date(r.effectiveFrom).getTime() <= t);
  const latest = (list) =>
    list.sort((a, b) =>
      new Date(b.effectiveFrom) - new Date(a.effectiveFrom) ||
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;

  const pid = promoterId ? String(promoterId) : null;
  const sameP = (r) => (r.promoterId ? String(r.promoterId) === pid : false);
  const noP = (r) => !r.promoterId;
  const sameC = (r) => (r.category || null) === (category || null);
  const noC = (r) => !r.category;

  const tiers = [
    (r) => pid && sameP(r) && category && sameC(r),
    (r) => pid && sameP(r) && noC(r),
    (r) => noP(r) && category && sameC(r),
    (r) => noP(r) && noC(r)
  ];
  for (const test of tiers) {
    const hit = latest(eligible.filter(test));
    if (hit) return { rateBps: hit.rateBps, source: hit };
  }
  return null;
}

/**
 * Margin guard: customer discount % + promoter commission % must stay under a ceiling.
 * mode 'warn' returns level 'warn' (save allowed), 'block' returns level 'block'.
 */
export function marginCheck({ discountBps = 0, commissionBps = 0, maxPct = 40, mode = 'warn' }) {
  const totalPct = (Number(discountBps) + Number(commissionBps)) / 100;
  if (totalPct <= maxPct) return { ok: true, level: 'ok', totalPct, maxPct };
  return { ok: mode !== 'block', level: mode === 'block' ? 'block' : 'warn', totalPct, maxPct };
}

/** A promoter can only be activated once KYC is verified and the agreement is signed. */
export function canActivatePromoter(p) {
  const missing = [];
  if (p.kycStatus !== 'verified') missing.push('KYC must be verified');
  if (p.agreementStatus !== 'signed') missing.push('Agreement must be signed');
  return { ok: missing.length === 0, missing };
}
