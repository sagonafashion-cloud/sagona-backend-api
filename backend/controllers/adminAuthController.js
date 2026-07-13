import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import AdminUser from '../models/AdminUser.js';

const generateAdminToken = (admin, expiresIn = '7d') =>
  jwt.sign(
    { id: admin._id, role: admin.role, assignedStores: admin.assignedStores, type: 'admin' },
    process.env.JWT_ADMIN_SECRET,
    { expiresIn }
  );

const generateTempToken = (adminId) =>
  jwt.sign(
    { id: adminId, type: 'admin_temp' },
    process.env.JWT_ADMIN_SECRET,
    { expiresIn: '5m' }
  );

const formatAdmin = (admin) => ({
  id: admin._id,
  name: admin.name,
  email: admin.email,
  role: admin.role,
  assignedStores: admin.assignedStores,
  twoFactorEnabled: admin.twoFactorEnabled,
  lastLogin: admin.lastLogin
});

export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const admin = await AdminUser.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!admin || !admin.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Update last login
    admin.lastLogin = new Date();
    admin.lastLoginIP = req.ip;
    await admin.save();

    if (admin.twoFactorEnabled) {
      return res.json({
        success: true,
        requiresTwoFactor: true,
        tempToken: generateTempToken(admin._id)
      });
    }

    res.json({
      success: true,
      token: generateAdminToken(admin),
      admin: formatAdmin(admin)
    });
  } catch (err) {
    console.error('adminLogin:', err);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
};

export const verifyTwoFactor = async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ success: false, message: 'Temp token and TOTP code required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_ADMIN_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Temp token expired or invalid' });
    }

    if (decoded.type !== 'admin_temp') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    const admin = await AdminUser.findById(decoded.id).select('+twoFactorSecret');
    if (!admin || !admin.isActive) {
      return res.status(401).json({ success: false, message: 'Admin not found' });
    }

    const valid = speakeasy.totp.verify({
      secret: admin.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid 2FA code' });
    }

    res.json({
      success: true,
      token: generateAdminToken(admin),
      admin: formatAdmin(admin)
    });
  } catch (err) {
    console.error('verifyTwoFactor:', err);
    res.status(500).json({ success: false, message: '2FA verification failed' });
  }
};

export const setupTwoFactor = async (req, res) => {
  try {
    const admin = await AdminUser.findById(req.adminUser._id);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

    const secret = speakeasy.generateSecret({
      name: `SAGONA Admin (${admin.email})`,
      length: 20
    });

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    // Save secret (not yet enabled — enabled after first verify)
    admin.twoFactorSecret = secret.base32;
    await admin.save();

    res.json({
      success: true,
      data: { qrCode, secret: secret.base32 }
    });
  } catch (err) {
    console.error('setupTwoFactor:', err);
    res.status(500).json({ success: false, message: '2FA setup failed' });
  }
};

export const confirmTwoFactorSetup = async (req, res) => {
  try {
    const { code } = req.body;
    const admin = await AdminUser.findById(req.adminUser._id).select('+twoFactorSecret');
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

    const valid = speakeasy.totp.verify({
      secret: admin.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!valid) {
      return res.status(400).json({ success: false, message: 'Invalid code — setup not confirmed' });
    }

    admin.twoFactorEnabled = true;
    await admin.save();

    res.json({ success: true, message: '2FA enabled' });
  } catch (err) {
    console.error('confirmTwoFactorSetup:', err);
    res.status(500).json({ success: false, message: 'Failed to confirm 2FA' });
  }
};

export const getMe = (req, res) => {
  res.json({ success: true, data: formatAdmin(req.adminUser) });
};

export const adminLogout = (_req, res) => {
  // JWT is stateless — client must discard the token
  res.json({ success: true, message: 'Logged out' });
};

export const listAdmins = async (_req, res) => {
  try {
    const admins = await AdminUser.find()
      .select('-password -twoFactorSecret')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: admins });
  } catch (err) {
    console.error('listAdmins:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch admins' });
  }
};

export const createAdmin = async (req, res) => {
  try {
    const { name, email, password, role, assignedStores } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'name, email, password and role required' });
    }

    const exists = await AdminUser.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Admin with this email already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const admin  = await AdminUser.create({
      name,
      email:    email.toLowerCase().trim(),
      password: hashed,
      role,
      assignedStores: assignedStores || []
    });

    res.status(201).json({ success: true, data: formatAdmin(admin) });
  } catch (err) {
    console.error('createAdmin:', err);
    res.status(500).json({ success: false, message: 'Failed to create admin' });
  }
};
