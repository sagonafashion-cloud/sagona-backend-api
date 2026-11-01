import OrderReferral from '../../models/referral/OrderReferral.js';
import OrderReferralLine from '../../models/referral/OrderReferralLine.js';
import CommissionLedger from '../../models/referral/CommissionLedger.js';
import ReferralJobState from '../../models/referral/ReferralJobState.js';
import Order from '../../models/Order.js';
import { getSettings, envEnabled } from './settings.js';
import { deriveSweepEntries } from './ledger.js';
import Promoter from '../../models/referral/Promoter.js';
import ReferralFraudFlag from '../../models/referral/ReferralFraudFlag.js';
import { scanReferredOrder, scanPromoters } from './fraudScan.js';

// Daily sweeper: reads each recent referred order and appends the ledger entries its
// current status calls for (eligible after the return window, reversal on cancel/return).
// It is idempotent (unique idempotency keys), self-healing after restarts, and holds its
// own lease lock so two instances never run it at once. Order/status code is not touched.

const LOOKBACK_DAYS = 180;
const BATCH = 200;
const LOCK_MS = 10 * 60 * 1000;

const realDeps = () => ({ OrderReferral, OrderReferralLine, CommissionLedger, ReferralJobState, Order, getSettings, log: console,
  fraud: { m: { Promoter, OrderReferral, ReferralFraudFlag, Order } } });

async function acquireLease(d, name, now) {
  try {
    const doc = await d.ReferralJobState.findOneAndUpdate(
      { name, $or: [{ lockedUntil: { $lt: now } }, { lockedUntil: { $exists: false } }] },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
      { upsert: true, new: true }
    );
    return !!doc;
  } catch (e) {
    if (e?.code === 11000) return false;          // someone else holds it
    throw e;
  }
}

export async function runReferralSweep(deps = realDeps(), now = new Date()) {
  const d = deps;
  if (!(await acquireLease(d, 'sweep', now))) return { skipped: 'locked' };
  const stats = { checked: 0, eligible: 0, reversed: 0, errors: 0 };
  try {
    const settings = await d.getSettings({ fresh: true });
    // Page through every recent referred order (by _id), so none is starved behind the others.
    let lastId;
    const fraudCache = new Map();
    for (;;) {
      const q = { status: 'applied', createdAt: { $gte: new Date(now.getTime() - LOOKBACK_DAYS * 86400000) } };
      if (lastId) q._id = { $gt: lastId };
      const refs = await d.OrderReferral.find(q).sort({ _id: 1 }).limit(BATCH).lean();
      if (!refs.length) break;
      lastId = refs[refs.length - 1]._id;

      for (const ref of refs) {
        try {
          stats.checked++;
          const order = await d.Order.findById(ref.orderId).select('status timeline shipments shippingAddress').lean();
          if (!order) continue;
          const lines = await d.OrderReferralLine.find({ orderReferralId: ref._id }).lean();
          const existing = await d.CommissionLedger.find({ orderReferralLineId: { $in: lines.map((l) => l._id) } }).lean();
          let held = !!(ref.flags && ref.flags.fraudHold);
          if (d.fraud) {                                   // automated rules (flag + hold only; never blocks a shopper)
            try { held = (await scanReferredOrder({ m: d.fraud.m, ref, order, settings, cache: fraudCache })) || held; }
            catch (fe) { d.log.error('[referral] fraud scan failed for order', String(ref.orderId), fe.message); }
          }
          const { entries, outcome } = deriveSweepEntries({ lines, existing, order, windowDays: settings.return_window_days, held, now });
          if (!entries.length) continue;
          try {
            await d.CommissionLedger.create(entries, { ordered: true });
          } catch (e) {
            if (e?.code !== 11000) throw e;           // a concurrent run already wrote it: fine
          }
          if (outcome === 'eligible') stats.eligible++;
          if (outcome === 'reversed') {
            stats.reversed++;
            await d.OrderReferral.updateOne({ _id: ref._id }, { $set: { status: 'void', voidedAt: now } });
          }
        } catch (e) {
          stats.errors++;
          d.log.error('[referral] sweep error for order', String(ref.orderId), e.message);
        }
      }
      if (refs.length < BATCH) break;
    }
    if (d.fraud) { try { stats.fraudAlerts = await scanPromoters({ m: d.fraud.m, settings, now }); } catch (fe) { d.log.error('[referral] promoter scan failed', fe.message); } }
    await d.ReferralJobState.updateOne({ name: 'sweep' }, { $set: { lastRunAt: now, lastResult: stats, lockedUntil: now } });
    return stats;
  } catch (e) {
    d.log.error('[referral] sweep failed:', e.message);
    return { ...stats, failed: e.message };
  }
}

export function startReferralJobs(intervalMs = 6 * 3600 * 1000) {
  if (!envEnabled()) return null;
  const tick = () => runReferralSweep().catch((e) => console.error('[referral] sweep tick failed:', e.message));
  const first = setTimeout(tick, 90 * 1000);
  const t = setInterval(tick, intervalMs);
  first.unref?.(); t.unref?.();
  console.log('[referral] commission sweep scheduled (every 6h)');
  return t;
}
