import crypto from 'crypto';

// Anti-spam for the public support form. No third-party CAPTCHA and no keys needed.
// Layers: hidden honeypot field, a signed "form loaded" token (bots that post straight to the
// API never have one), minimum fill time, gibberish-name check, link count, and caps on
// automatic replies (the abusive part: replying to addresses a bot typed in).

export const MIN_FILL_MS = 3000;
export const MAX_AGE_MS = 2 * 60 * 60 * 1000;

const key = () => crypto.createHmac('sha256', process.env.JWT_SECRET || '').update('support-form-v1').digest();
const sign = (ts) => crypto.createHmac('sha256', key()).update(String(ts)).digest('hex').slice(0, 32);

export const makeToken = (now = Date.now()) => `${now}.${sign(now)}`;

/** { state: 'missing' | 'invalid' | 'valid' | 'toofast' | 'expired' } */
export function checkToken(token, now = Date.now()) {
  if (token === undefined || token === null || token === '') return { state: 'missing' };
  const m = /^(\d{10,16})\.([0-9a-f]{32})$/.exec(String(token));
  if (!m) return { state: 'invalid' };
  const a = Buffer.from(sign(m[1])), b = Buffer.from(m[2]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { state: 'invalid' };
  const age = now - Number(m[1]);
  if (age < 0) return { state: 'invalid' };
  if (age < MIN_FILL_MS) return { state: 'toofast' };
  if (age > MAX_AGE_MS) return { state: 'expired' };
  return { state: 'valid' };
}

/**
 * A name token that cannot be a real word. Deliberately conservative: a false alarm only means the
 * message is delivered "for review" (or, if it also lacks the form token, dropped), so real names
 * such as Krishnan, Smith, Christopher, Dhruv or Szymczak must pass.
 */
const plain = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
export function looksGibberish(name) {
  const tokens = String(name || '').split(/[^\p{L}]+/u).filter(Boolean).map(plain);
  return tokens.some((s) => {
    if (s.length < 4) return false;
    const vowels = (s.match(/[aeiouy]/g) || []).length;
    if (vowels === 0) return true;                                   // "Wzwq", "Mdhggj", "Vlnsgm", "Swdc"
    if (/[^aeiouy]{6,}/.test(s)) return true;                        // six consonants in a row
    return s.length >= 8 && vowels / s.length < 0.25;                // "Iktfbsvku"
  });
}

export const countLinks = (text) => (String(text || '').match(/https?:\/\/|www\./gi) || []).length;

/**
 * @returns {{ action: 'normal'|'review'|'drop', reasons: string[] }}
 *   drop   : silently discarded (the sender still gets a normal-looking success)
 *   review : delivered to the support inbox, tagged, with NO automatic reply
 *   normal : delivered, automatic reply allowed (subject to caps)
 */
export function classify({ body = {}, now = Date.now() }) {
  const reasons = [];
  if (String(body.website || '').trim()) return { action: 'drop', reasons: ['honeypot'] };
  const tok = checkToken(body.formToken, now);
  if (tok.state === 'invalid') return { action: 'drop', reasons: ['bad_token'] };
  if (tok.state === 'toofast') return { action: 'drop', reasons: ['too_fast'] };

  const suspicious = [];
  if (looksGibberish(body.name)) suspicious.push('gibberish_name');
  if (countLinks(body.message) >= 2) suspicious.push('links');

  if (tok.state === 'valid') {
    return suspicious.length ? { action: 'review', reasons: suspicious } : { action: 'normal', reasons };
  }
  // missing / expired token: could be a cached old page or a bot that skipped the form
  reasons.push(`token_${tok.state}`, ...suspicious);
  if (tok.state === 'missing' && suspicious.length) return { action: 'drop', reasons };
  return { action: 'review', reasons };
}

/** Caps on automatic replies: one per address per 24h, and a daily ceiling overall. */
export function makeReplyLimiter({ perAddress = 1, perDay = 40, windowMs = 24 * 3600 * 1000 } = {}) {
  const seen = new Map();   // email -> [timestamps]
  let total = [];
  return {
    allow(email, now = Date.now()) {
      total = total.filter((t) => now - t < windowMs);
      const e = String(email).toLowerCase();
      const mine = (seen.get(e) || []).filter((t) => now - t < windowMs);
      if (mine.length >= perAddress || total.length >= perDay) { seen.set(e, mine); return false; }
      mine.push(now); seen.set(e, mine); total.push(now);
      if (seen.size > 5000) for (const [k, v] of seen) if (!v.some((t) => now - t < windowMs)) seen.delete(k);
      return true;
    }
  };
}
