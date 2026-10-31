import crypto from 'crypto';

// AES-256-GCM field/file encryption for promoter PAN, GSTIN, bank account and
// KYC documents. The key comes from REFERRAL_ENC_KEY (64 hex chars, or any
// string of 32+ chars which is hashed to 32 bytes). Nothing here is required
// for server boot: callers get a clear error only when they actually try to
// encrypt/decrypt without a key.

export class CryptoConfigError extends Error {
  constructor() {
    super('REFERRAL_ENC_KEY is not configured (needs 64 hex chars or 32+ characters)');
    this.statusCode = 503;
  }
}

function getKey() {
  const raw = (process.env.REFERRAL_ENC_KEY || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  if (raw.length >= 32) return crypto.createHash('sha256').update(raw).digest();
  throw new CryptoConfigError();
}

export const cryptoConfigured = () => {
  try { getKey(); return true; } catch { return false; }
};

/** Encrypt a Buffer. Output = iv(12) | tag(16) | ciphertext. */
export function encryptBuffer(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

export function decryptBuffer(blob) {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Encrypt a string -> "v1:<base64>". */
export const encryptString = (s) => `v1:${encryptBuffer(Buffer.from(String(s), 'utf8')).toString('base64')}`;

export function decryptString(s) {
  if (typeof s !== 'string' || !s.startsWith('v1:')) throw new Error('Unrecognised ciphertext format');
  return decryptBuffer(Buffer.from(s.slice(3), 'base64')).toString('utf8');
}

/** Keyed hash for duplicate detection without storing the plain value. */
export const blindIndex = (value) =>
  crypto.createHmac('sha256', getKey()).update(`bi:${String(value)}`).digest('hex');

export const last4 = (s) => String(s).slice(-4);

/** "XXXXXX1234" style mask from the stored last 4. */
export const maskLast4 = (l4, len = 10) => (l4 ? `${'X'.repeat(Math.max(0, len - 4))}${l4}` : null);
