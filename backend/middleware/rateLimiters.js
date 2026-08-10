import rateLimit from 'express-rate-limit';

// Centralised, per-endpoint rate limiters. Kept separate from the coarse
// path-level limiters in server.js so each high-value/high-cost endpoint can
// have a tighter budget than its parent path group.
//
// NOTE: the Razorpay webhook (/api/payment/webhook) is intentionally NOT
// rate limited anywhere — Razorpay's own infra retries deliveries and a
// limiter there would cause dropped/duplicated payment-status updates.

const standardMessage = (msg) => ({ success: false, message: msg });

// Shared factory — every limiter below only differs in windowMs/max/message
// and (sometimes) keyGenerator/skipSuccessfulRequests, so build them from one
// place instead of repeating the same rateLimit({...}) shape nine times.
const makeLimiter = ({ windowMs, max, message, keyGenerator, skipSuccessfulRequests }) =>
  rateLimit({
    windowMs,
    max,
    ...(keyGenerator ? { keyGenerator } : {}),
    ...(skipSuccessfulRequests ? { skipSuccessfulRequests: true } : {}),
    standardHeaders: true,
    legacyHeaders: false,
    message: standardMessage(message),
  });

const emailOrIpKey = (req) => (req.body?.email || '').toLowerCase().trim() || req.ip;
const userOrIpKey  = (req) => req.user?.id || req.ip;

// Login (customer): brute-force / credential-stuffing protection.
export const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Try again in 15 minutes.',
});

// Admin login: smaller attack surface, higher privilege — tighter budget.
// Keyed by the submitted email (falling back to IP when absent) rather than
// IP alone, so an attacker rotating source IPs against one admin account
// can't bypass the budget — account-level lockout (adminAuthController.js)
// backstops this further.
export const adminLoginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  skipSuccessfulRequests: true,
  keyGenerator: emailOrIpKey,
  message: 'Too many login attempts. Try again in 15 minutes.',
});

// Registration: throttle bulk fake-account creation. Kept tighter than a
// simple "prevent spam" budget would need, since the register error message
// distinguishes "already exists" from other failures (account-enumeration
// surface) — a low per-IP ceiling is the primary mitigation for that.
export const registerLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many accounts created from this network. Try again later.',
});

// Password reset request/confirm: prevent OTP-spam / enumeration abuse.
export const passwordResetLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many password reset attempts. Try again in an hour.',
});

// Payment create-order / verify: protects against automated probing of the
// payment flow (card/amount tampering attempts, signature brute forcing).
export const paymentLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: userOrIpKey,
  message: 'Too many payment requests. Please slow down and try again shortly.',
});

// Order creation: throttle scripted checkout/order spam per user.
export const orderCreateLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKey,
  message: 'Too many orders placed. Please slow down and try again shortly.',
});

// File uploads (bulk product import, try-on photo upload): expensive to
// process (parsing / image handling), so keep the budget tight.
export const uploadLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyGenerator: userOrIpKey,
  message: 'Too many uploads. Please slow down and try again shortly.',
});

// AI / generative endpoints (virtual try-on generation): compute + $ cost per
// call, so this is deliberately the tightest budget of the set.
export const aiGenerationLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKey,
  message: 'Too many AI requests this hour. Please try again later.',
});

// Pincode / delivery lookup: prevent scraping the pincode→city/state mapping
// and hammering the upstream postal APIs.
export const pincodeLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many lookups. Please slow down.',
});

// Support/contact form: the endpoint sends an auto-reply to whatever email
// the requester submits, so without a per-email budget an attacker can
// repeatedly submit a third party's address as "email" to email-bomb them
// (in addition to spamming the support inbox). Keyed by the submitted email,
// same pattern as adminLoginLimiter, falling back to IP when absent.
export const contactLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: emailOrIpKey,
  message: 'Too many messages sent. Please try again in an hour.',
});
