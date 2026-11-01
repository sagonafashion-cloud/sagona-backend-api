import { rupees } from './payout.js';

// Promoter emails. Amounts only: no customer name, phone, address or order contents ever.
const DAY = 86400000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (p) => `₹${(Math.round(p) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Turn recent ledger entries and paid payout items into outbox rows (keys make this idempotent). */
export function collectEvents({ ledger, payoutItems }) {
  const out = [];
  for (const e of ledger) {
    const base = { promoterId: e.promoterId, key: `led:${e._id}` };
    if (e.entryType === 'accrual_pending' && e.amountPaise > 0) out.push({ ...base, type: 'order_referred', data: { amountPaise: e.amountPaise } });
    else if (e.entryType === 'accrual_eligible' && e.amountPaise > 0) out.push({ ...base, type: 'commission_payable', data: { amountPaise: e.amountPaise } });
    else if ((e.entryType === 'reversal_cancel' || e.entryType === 'reversal_return') && e.amountPaise < 0) out.push({ ...base, type: 'commission_reversed', data: { amountPaise: -e.amountPaise } });
    // reversal_fraud is deliberately NOT notified: handled personally by the owner.
  }
  for (const i of payoutItems) if (i.status === 'paid') out.push({ promoterId: i.promoterId, key: `pay:${i._id}`, type: 'payout_paid', data: { netPaise: i.netPaise, voucherNo: i.voucherNo, utr: i.utr } });
  return out;
}

const wrap = (name, inner, portalUrl) => `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#222">
  <h2 style="color:#111">Hi ${esc(name)},</h2>${inner}
  ${portalUrl ? `<p style="margin-top:18px"><a href="${esc(portalUrl)}">View your dashboard</a></p>` : ''}
  <p style="font-size:12px;color:#777;margin-top:24px">You get these emails because you are a SAGONA promoter. You can switch them off in your dashboard.</p></div>`;

/** One email per promoter per type, summarising all pending events of that type. */
export function buildEmail(type, rows, promoter, portalUrl) {
  const n = rows.length;
  const sum = (f) => rows.reduce((s, r) => s + f(r.data), 0);
  if (type === 'order_referred') {
    const amt = sum((d) => d.amountPaise);
    return { subject: `${n} new order${n > 1 ? 's' : ''} used your SAGONA code`, html: wrap(promoter.name, `<p>${n} new order${n > 1 ? 's' : ''} used your referral code. Commission earned: <b>${inr(amt)}</b>.</p><p>It stays pending until the return window is over, then becomes payable.</p>`, portalUrl) };
  }
  if (type === 'commission_payable') {
    return { subject: `${inr(sum((d) => d.amountPaise))} commission is now payable`, html: wrap(promoter.name, `<p><b>${inr(sum((d) => d.amountPaise))}</b> of your commission has cleared the return window and will be included in the next payout.</p>`, portalUrl) };
  }
  if (type === 'commission_reversed') {
    return { subject: 'A commission was reversed', html: wrap(promoter.name, `<p>${n} order${n > 1 ? 's were' : ' was'} cancelled or returned, so <b>${inr(sum((d) => d.amountPaise))}</b> of commission has been reversed.</p>`, portalUrl) };
  }
  const lines = rows.map((r) => `<li>${esc(r.data.voucherNo)}: <b>${inr(r.data.netPaise)}</b>${r.data.utr ? ` (bank ref ${esc(r.data.utr)})` : ''}</li>`).join('');
  return { subject: 'Your SAGONA payout has been paid', html: wrap(promoter.name, `<p>We have paid:</p><ul>${lines}</ul>`, portalUrl) };
}

/**
 * deps: { Ledger, PayoutItem, Notification, Promoter, getSettings, sendEmail, portalUrl, log }
 * Safe to run repeatedly and from several instances.
 */
export async function runNotificationSweep(d, now = new Date()) {
  const settings = await d.getSettings();
  if (!settings.notifications_enabled) return { skipped: 'disabled' };
  const since = new Date(now - 3 * DAY);
  const [ledger, payoutItems] = await Promise.all([
    d.Ledger.find({ eventAt: { $gte: since }, entryType: { $in: ['accrual_pending', 'accrual_eligible', 'reversal_cancel', 'reversal_return'] } }).select('promoterId entryType amountPaise').lean(),
    d.PayoutItem.find({ status: 'paid', paidAt: { $gte: since } }).select('promoterId status netPaise voucherNo utr').lean()
  ]);
  for (const ev of collectEvents({ ledger, payoutItems })) {
    try { await d.Notification.create(ev); } catch (e) { if (e?.code !== 11000) throw e; }
  }
  const pending = await d.Notification.find({ status: 'pending', attempts: { $lt: 5 } }).limit(500).lean();
  const groups = new Map();
  for (const n of pending) { const k = `${n.promoterId}|${n.type}`; (groups.get(k) || groups.set(k, []).get(k)).push(n); }
  const stats = { sent: 0, skipped: 0, failed: 0 };
  const cache = new Map();
  for (const [k, rows] of groups) {
    const [pid, type] = k.split('|');
    if (!cache.has(pid)) cache.set(pid, await d.Promoter.findById(pid).select('name email status notifyEmail').lean());
    const p = cache.get(pid);
    const ids = rows.map((r) => r._id);
    if (!p || !p.email || p.status !== 'active' || p.notifyEmail === false) {
      await d.Notification.updateMany({ _id: { $in: ids }, status: 'pending' }, { $set: { status: 'skipped' } });
      stats.skipped += rows.length; continue;
    }
    try {
      const mail = buildEmail(type, rows, p, d.portalUrl);
      // Claim first: only the instance that flips pending->sent sends, so two servers never double-send.
      const claim = await d.Notification.updateMany({ _id: { $in: ids }, status: 'pending' }, { $set: { status: 'sent', sentAt: now } });
      if (!claim.modifiedCount) continue;
      try { await d.sendEmail({ to: p.email, subject: mail.subject, html: mail.html }); stats.sent += rows.length; }
      catch (err) {
        await d.Notification.updateMany({ _id: { $in: ids } }, { $set: { status: 'pending', error: String(err.message).slice(0, 200) }, $inc: { attempts: 1 }, $unset: { sentAt: 1 } });
        stats.failed += rows.length;
      }
    } catch (err) { d.log?.error('[referral] notification build failed', err.message); stats.failed += rows.length; }
  }
  return stats;
}
