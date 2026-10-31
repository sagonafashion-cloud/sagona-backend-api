import ReferralAuditLog from '../../models/referral/ReferralAuditLog.js';
import { scrub } from '../../utils/referralValidators.js';

/**
 * Append an entry to the referral audit log.
 * - before/after are scrubbed: encrypted/hashed fields never reach the log.
 * - strict=true (sensitive reveals, document downloads): the audit write must
 *   succeed BEFORE the caller returns data, so a failure throws.
 * - strict=false: a failure is logged to the console and swallowed so the
 *   admin's action is not lost to a logging problem.
 */
export async function audit(req, { action, entity, entityId, before, after, reason }, { strict = false } = {}) {
  const entry = {
    actorId: req.adminUser?._id,
    actorName: req.adminUser?.name,
    role: req.adminUser?.role,
    action,
    entity,
    entityId: entityId != null ? String(entityId) : undefined,
    before: before === undefined ? undefined : scrub(JSON.parse(JSON.stringify(before))),
    after: after === undefined ? undefined : scrub(JSON.parse(JSON.stringify(after))),
    reason,
    ip: req.ip,
    userAgent: req.headers?.['user-agent']
  };
  if (strict) {
    await ReferralAuditLog.create(entry);
    return;
  }
  try {
    await ReferralAuditLog.create(entry);
  } catch (err) {
    console.error(`[referral] audit write failed for "${action}":`, err.message);
  }
}
