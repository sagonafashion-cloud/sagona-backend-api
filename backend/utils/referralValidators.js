// Pure validators for the referral/promoter module (no I/O, fully unit-tested).

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const MOBILE_RE = /^[6-9][0-9]{9}$/;
export const ACCOUNT_RE = /^[0-9]{9,18}$/;

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** GSTIN check digit (mod-36 over the first 14 characters). */
export function gstinChecksum(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARSET.indexOf(first14[i]);
    if (v < 0) return null;
    const prod = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

export function isValidGstin(g) {
  const s = String(g || '').toUpperCase();
  return GSTIN_RE.test(s) && gstinChecksum(s.slice(0, 14)) === s[14];
}

export const isValidPan = (p) => PAN_RE.test(String(p || '').toUpperCase());
export const isValidIfsc = (i) => IFSC_RE.test(String(i || '').toUpperCase());
export const isValidMobile = (m) => MOBILE_RE.test(String(m || ''));
export const isValidAccount = (a) => ACCOUNT_RE.test(String(a || ''));

export const isAdult = (dob, now = new Date()) => {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
  return d.getTime() <= cutoff.getTime();
};

// Referral code alphabet: no 0/O/1/I/L so codes can be read out or typed without mistakes.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4,20}$/;

export const normalizeCode = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '');
export const isValidCode = (c) => CODE_RE.test(normalizeCode(c));

export const COMMISSION_CATEGORIES = ['kids', 'women', 'men', 'accessories'];

/** Drops encrypted/hashed/secret keys so audit logs and API output never carry them. */
export function scrub(obj) {
  if (Array.isArray(obj)) return obj.map(scrub);
  if (!obj || typeof obj !== 'object' || obj instanceof Date) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/(Enc|Hash)$/.test(k) || /password|secret|token/i.test(k)) continue;
    out[k] = scrub(v);
  }
  return out;
}
