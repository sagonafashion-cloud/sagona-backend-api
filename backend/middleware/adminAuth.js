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
    const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET);

    if (decoded.type !== 'admin') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    const adminUser = await AdminUser.findById(decoded.id).select('-password -twoFactorSecret');
    if (!adminUser || !adminUser.isActive) {
      return res.status(401).json({ success: false, message: 'Account not found or inactive' });
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
  next();
};
