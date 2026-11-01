import ReferralSetting from '../../models/referral/ReferralSetting.js';

// Every setting, its default, and a validator. Nothing tax-related is hard-coded
// to a rate the owner has not confirmed with the CA: TDS and slab settings default
// to OFF / zero.
export const SETTING_DEFS = {
  enabled:                      { def: false,        check: (v) => typeof v === 'boolean' },
  return_window_days:           { def: 10,           check: (v) => Number.isInteger(v) && v >= 0 && v <= 90 },
  min_payout_paise:             { def: 50000,        check: (v) => Number.isInteger(v) && v >= 0 },
  payout_day:                   { def: 5,            check: (v) => Number.isInteger(v) && v >= 1 && v <= 28 },
  commission_base:              { def: 'NET_EX_GST', check: (v) => ['NET_EX_GST', 'LIST_EX_GST', 'NET_INCL_GST'].includes(v) },
  margin_guard_max_pct:         { def: 40,           check: (v) => typeof v === 'number' && v > 0 && v <= 100 },
  margin_guard_mode:            { def: 'warn',       check: (v) => ['warn', 'block'].includes(v) },
  tds_enabled:                  { def: false,        check: (v) => typeof v === 'boolean' },
  tds_section:                  { def: '',           check: (v) => typeof v === 'string' && v.length <= 20 },
  tds_rate_bps:                 { def: 0,            check: (v) => Number.isInteger(v) && v >= 0 && v <= 10000 },
  tds_annual_threshold_paise:   { def: 0,            check: (v) => Number.isInteger(v) && v >= 0 },
  store_state_code:             { def: '05',         check: (v) => typeof v === 'string' && /^\d{2}$/.test(v) },   // GST state code of the store (05 = Uttarakhand)
  gst_on_commission_bps:        { def: 1800,         check: (v) => Number.isInteger(v) && v >= 0 && v <= 10000 },
  reevaluate_gst_slab:          { def: false,        check: (v) => typeof v === 'boolean' },
  slab_threshold_paise:         { def: 250000,       check: (v) => Number.isInteger(v) && v > 0 },   // per-piece value at/below which the low rate applies (CA to confirm)
  slab_low_rate:                { def: 5,            check: (v) => [0, 5, 12, 18, 28, 40].includes(v) },
  slab_high_rate:               { def: 18,           check: (v) => [0, 5, 12, 18, 28, 40].includes(v) },
  fraud_velocity_orders_24h:    { def: 5,            check: (v) => Number.isInteger(v) && v >= 1 },
  fraud_return_rate_alert_pct:  { def: 40,           check: (v) => typeof v === 'number' && v > 0 && v <= 100 },
  agreement_template_version:   { def: 'v1',         check: (v) => typeof v === 'string' && v.length > 0 && v.length <= 20 },
  agreement_grace_days:         { def: 30,           check: (v) => Number.isInteger(v) && v >= 0 && v <= 365 },
  terms_url:                    { def: '/referral-terms.html', check: (v) => typeof v === 'string' && v.length <= 300 },
  support_contact:              { def: '',           check: (v) => typeof v === 'string' && v.length <= 200 }
};

const TTL_MS = 15_000;
let cache = null;
let cacheAt = 0;

export function defaultSettings() {
  return Object.fromEntries(Object.entries(SETTING_DEFS).map(([k, d]) => [k, d.def]));
}

/** Current value of every setting (newest row per key, falling back to defaults). */
export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cacheAt < TTL_MS) return cache;
  const rows = await ReferralSetting.aggregate([
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$key', value: { $first: '$value' } } }
  ]);
  const out = defaultSettings();
  for (const r of rows) {
    if (r._id in SETTING_DEFS && SETTING_DEFS[r._id].check(r.value)) out[r._id] = r.value;
  }
  cache = out;
  cacheAt = Date.now();
  return out;
}

export const clearSettingsCache = () => { cache = null; };

/** Validate a partial update. Returns { ok, errors, clean }. */
export function validateSettingsUpdate(patch) {
  const errors = [];
  const clean = {};
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, errors: ['Body must be an object'], clean };
  for (const [k, v] of Object.entries(patch)) {
    const def = SETTING_DEFS[k];
    if (!def) { errors.push(`Unknown setting: ${k}`); continue; }
    if (!def.check(v)) { errors.push(`Invalid value for ${k}`); continue; }
    clean[k] = v;
  }
  return { ok: errors.length === 0, errors, clean };
}

/**
 * The programme is live only when BOTH switches are on:
 *   1. env REFERRAL_ENABLED === 'true'  (server-level kill switch; also decides whether
 *      any referral code is even loaded at boot), and
 *   2. the super-admin DB setting `enabled` is true.
 * Flag off => storefront field hidden, validate/apply unavailable, no referral
 * code path runs, order totals come from the unchanged legacy code.
 */
export const envEnabled = () => process.env.REFERRAL_ENABLED === 'true';

export async function isProgrammeEnabled() {
  if (!envEnabled()) return false;
  try { return (await getSettings()).enabled === true; } catch { return false; }
}
