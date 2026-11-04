import axios from 'axios';

// Cloudflare Turnstile (CAPTCHA) verification for the public support form.
// Off until TURNSTILE_SECRET_KEY is set on the server, so deploying this can never break the form.
// If Cloudflare itself cannot be reached we let the message through (the honeypot, form token,
// rate limits and name checks still apply): a Cloudflare outage must not stop customers writing to us.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const turnstileEnabled = () => !!process.env.TURNSTILE_SECRET_KEY;

/** @returns {Promise<{ok:boolean, skipped?:boolean, reason?:string}>} */
export async function verifyTurnstile(token, ip, post = axios.post) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (typeof token !== 'string' || !token || token.length > 2048) return { ok: false, reason: 'missing' };
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set('remoteip', ip);
    const { data } = await post(VERIFY_URL, form.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 });
    return data?.success === true ? { ok: true } : { ok: false, reason: (data?.['error-codes'] || []).join(',') || 'failed' };
  } catch (e) {
    console.error('[support] turnstile unreachable, allowing message:', e.message);
    return { ok: true, skipped: true, reason: 'unreachable' };
  }
}
