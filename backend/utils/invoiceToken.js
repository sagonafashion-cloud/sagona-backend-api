import crypto from 'crypto';

// Order numbers (SAG-YYYYMMDD-NNNN) are sequential and therefore guessable, so
// the public invoice link must carry an unguessable per-order token. The token
// is an HMAC of the order number under a server secret: it can be recomputed
// when an email is built, needs no database field, and can't be forged without
// the secret.
const secret = () => process.env.JWT_SECRET || '';

export const invoiceToken = (orderNumber) =>
  crypto.createHmac('sha256', secret()).update(`invoice:${orderNumber}`).digest('hex').slice(0, 32);

export const verifyInvoiceToken = (orderNumber, token) => {
  if (!secret() || typeof token !== 'string' || token.length !== 32) return false;
  const expected = Buffer.from(invoiceToken(orderNumber));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
};
