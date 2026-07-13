import rateLimit from 'express-rate-limit';

// Centralised, per-endpoint rate limiters. Kept separate from the coarse
// path-level limiters in server.js so each high-value/high-cost endpoint can
// have a tighter budget than its parent path group.
//
// NOTE: the Razorpay webhook (/api/payment/webhook) is intentionally NOT
// rate limited anywhere — Razorpay's own infra retries deliveries and a
// limiter there would cause dropped/duplicated payment-status updates.

const standardMessage = (msg) => ({ success: false, message: msg });

// Login (customer): brute-force / credential-stuffing protection.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage('Too many login attempts. Try again in 15 minutes.'),
});

// Admin login: smaller attack surface, higher privilege — tighter budget.
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage('Too many login attempts. Try again in 15 minutes.'),
});

// Registration: throttle bulk fake-account creation.
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage('Too many accounts created from this network. Try again later.'),
});

// Password reset request/confirm: prevent OTP-spam / enumeration abuse.
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage('Too many password reset attempts. Try again in an hour.'),
});

// Payment create-order / verify: protects against automated probing of the
// payment flow (card/amount tampering attempts, signature brute forcing).
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage('Too many payment requests. Please slow down and try again shortly.'),
});

// Order creation: throttle scripted checkout/order spam per user.
export const orderCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage('Too many orders placed. Please slow down and try again shortly.'),
});

// File uploads (bulk product import, try-on photo upload): expensive to
// process (parsing / image handling), so keep the budget tight.
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage('Too many uploads. Please slow down and try again shortly.'),
});

// AI / generative endpoints (virtual try-on generation): compute + $ cost per
// call, so this is deliberately the tightest budget of the set.
export const aiGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage('Too many AI requests this hour. Please try again later.'),
});

// Pincode / delivery lookup: prevent scraping the pincode→city/state mapping
// and hammering the upstream postal APIs.
export const pincodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage('Too many lookups. Please slow down.'),
});
