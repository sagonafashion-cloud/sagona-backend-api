// Startup environment-variable validation.
//
// The app previously discovered a missing/misconfigured env var only when the
// first request hit the code path that needed it — e.g. a payment failing in
// production because RAZORPAY_KEY_SECRET was never set on the host, or JWTs
// silently signable/forgeable with an empty-string secret. Fail fast instead:
// crash on boot with a clear message naming exactly what's missing.

// Vars the app cannot run without, at all.
const REQUIRED_VARS = [
  'MONGO_URI',
  'JWT_SECRET',
  'JWT_ADMIN_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET'
];

// Vars that degrade gracefully at the call site (feature disabled / logged
// warning) rather than crashing, but are worth flagging loudly at boot so a
// missing one isn't discovered by a confused user days later.
const RECOMMENDED_VARS = [
  'NODE_ENV',
  'ANTHROPIC_API_KEY',
  'RAZORPAY_WEBHOOK_SECRET',
  'EMAIL_USER',
  'EMAIL_PASS',
  'CORS_ORIGINS'
];

const WEAK_SECRET_VALUES = new Set([
  'secret', 'changeme', 'change_me', 'password', 'jwt_secret', 'jwtsecret',
  'your_jwt_secret', 'your-secret-key', 'supersecret', 'admin', 'test', '123456',
  'secretkey', 'secret_key', 'mysecret', 'devsecret'
]);

const MIN_SECRET_LENGTH = 32;

function checkSecretStrength(name, value, errors) {
  if (!value) return; // already reported as missing by the required-vars pass
  if (value.length < MIN_SECRET_LENGTH) {
    errors.push(
      `${name} is only ${value.length} characters long — must be at least ${MIN_SECRET_LENGTH} ` +
      `characters. Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
    );
  }
  if (WEAK_SECRET_VALUES.has(value.trim().toLowerCase())) {
    errors.push(`${name} is set to a common placeholder/weak value ("${value}") — this must be a random secret.`);
  }
}

/**
 * Validate required environment variables. Exits the process with a
 * descriptive message if anything critical is missing or unsafe.
 *
 * Call this once, as early as possible in server.js — before connectDB(),
 * before Sentry.init(), before the Express app is constructed — so a
 * misconfigured deploy fails at boot instead of mid-request.
 */
export function validateEnv() {
  const errors = [];
  const warnings = [];

  for (const name of REQUIRED_VARS) {
    if (!process.env[name] || !process.env[name].trim()) {
      errors.push(`${name} is not set.`);
    }
  }

  for (const name of RECOMMENDED_VARS) {
    if (!process.env[name] || !process.env[name].trim()) {
      warnings.push(`${name} is not set — related functionality will be disabled or degraded.`);
    }
  }

  checkSecretStrength('JWT_SECRET', process.env.JWT_SECRET, errors);
  checkSecretStrength('JWT_ADMIN_SECRET', process.env.JWT_ADMIN_SECRET, errors);

  if (
    process.env.JWT_SECRET &&
    process.env.JWT_ADMIN_SECRET &&
    process.env.JWT_SECRET.trim() === process.env.JWT_ADMIN_SECRET.trim()
  ) {
    errors.push(
      'JWT_SECRET and JWT_ADMIN_SECRET must be different values — reusing the same secret ' +
      'means a leaked/forged customer token could be replayed as (or reasoned about alongside) an admin token.'
    );
  }

  if (process.env.NODE_ENV === 'production' && (!process.env.CORS_ORIGINS || !process.env.CORS_ORIGINS.trim())) {
    errors.push(
      'CORS_ORIGINS is not set while NODE_ENV=production — with no allowlist, cross-origin ' +
      'requests will fail closed for legitimate origins (check server.js\'s ALLOWED_ORIGINS handling); set it explicitly.'
    );
  }

  if (warnings.length) {
    console.warn('\n[env] Startup warnings (non-fatal):');
    for (const w of warnings) console.warn(`  - ${w}`);
  }

  if (errors.length) {
    console.error('\n[env] Refusing to start — invalid environment configuration:');
    for (const e of errors) console.error(`  - ${e}`);
    console.error('\nSet the missing/invalid variables (see .env.example) and restart.\n');
    process.exit(1);
  }
}

export default validateEnv;
