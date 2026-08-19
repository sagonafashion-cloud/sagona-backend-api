import ActivityLog from '../models/ActivityLog.js';

/**
 * Fire-and-forget admin activity logger.
 *
 * Writes one ActivityLog entry per admin-mutation action. A logging failure
 * must never break the real admin action it documents, so this always
 * swallows its own errors (after logging them to the console for
 * visibility) instead of throwing or rejecting into the caller.
 *
 * @param {import('express').Request} req - the admin request; adminUser is
 *   read from req.adminUser (set by middleware/adminAuth.js#adminProtect).
 * @param {string} action - e.g. "order.status_update", "product.delete".
 * @param {object} [opts]
 * @param {string} [opts.targetType] - e.g. "Order", "Product".
 * @param {string|object} [opts.targetId] - id of the affected resource.
 * @param {object} [opts.details] - small before/after summary, not a full document dump.
 */
export const logAdminActivity = (req, action, opts = {}) => {
  try {
    const admin = req?.adminUser;
    if (!admin) return; // nothing to attribute the action to — skip rather than log garbage

    const { targetType, targetId, details } = opts;

    ActivityLog.create({
      adminUserId: admin._id,
      action,
      targetType,
      targetId: targetId !== undefined && targetId !== null ? String(targetId) : undefined,
      details: {
        adminEmail: admin.email,
        adminName: admin.name,
        ...(details || {})
      },
      ip: req.ip,
      userAgent: req.headers?.['user-agent']
    }).catch((err) => {
      // Never let a logging failure surface to the caller / affect the response.
      console.error(`ActivityLog write failed for action "${action}":`, err.message);
    });
  } catch (err) {
    console.error(`ActivityLog write failed for action "${action}":`, err.message);
  }
};
