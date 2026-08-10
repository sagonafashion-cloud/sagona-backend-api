import jwt from 'jsonwebtoken';
import AdminUser from '../models/AdminUser.js';

export const adminProtect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET, { algorithms: ['HS256'] });

    if (decoded.type !== 'admin') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    const adminUser = await AdminUser.findById(decoded.id).select('-password -twoFactorSecret');
    if (!adminUser || !adminUser.isActive) {
      return res.status(401).json({ success: false, message: 'Account not found or inactive' });
    }

    // Server-side revocation: logout (or any future forced-logout action)
    // bumps tokenVersion, immediately invalidating every JWT issued before
    // that point even though JWTs are otherwise stateless.
    if ((decoded.tokenVersion || 0) !== (adminUser.tokenVersion || 0)) {
      return res.status(401).json({ success: false, message: 'Session revoked, please log in again' });
    }

    req.adminUser = adminUser;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Usage: requireRole('super_admin', 'finance_manager')
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.adminUser) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  if (!roles.includes(req.adminUser.role)) {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }
  // The highest-privilege roles must have 2FA enabled before performing any
  // role-gated action — password alone isn't enough protection for accounts
  // that can create admins or touch financial data. /setup-2fa and
  // /confirm-2fa only require adminProtect (no requireRole), so an admin can
  // always self-enroll here without ever being permanently locked out.
  if (['super_admin', 'finance_manager'].includes(req.adminUser.role) && !req.adminUser.twoFactorEnabled) {
    return res.status(403).json({
      success: false,
      message: 'Two-factor authentication is required for this role. Enable it via /admin/auth/setup-2fa before continuing.'
    });
  }
  next();
};
