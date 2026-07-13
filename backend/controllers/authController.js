import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { sendWelcome, sendPasswordReset, storeOtp, verifyOtp } from '../utils/emailService.js';

const generateToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

const formatUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  loyaltyPoints: user.loyaltyPoints,
  birthday: user.birthday,
});

// Resolve identifier (email or 10-digit phone) to a query
function identifierQuery(identifier) {
  if (!identifier) return null;
  const trimmed = identifier.trim();
  if (/^\d{10}$/.test(trimmed)) return { phone: trimmed };
  return { email: trimmed.toLowerCase() };
}

export const registerUser = async (req, res) => {
  try {
    const { name, password, birthday } = req.body;
    // Support both `email` (mobile app) and `identifier` (web — email or phone)
    const raw = req.body.identifier || req.body.email || '';
    const isPhone = /^\d{10}$/.test(raw.trim());

    if (!name || !raw || !password) {
      return res.status(400).json({ message: 'Name, email/phone, and password are required' });
    }

    const query = identifierQuery(raw);
    const exists = await User.findOne(query);
    if (exists) {
      return res.status(400).json({ message: 'An account with that email/phone already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const userData = {
      name,
      password: hashed,
      birthday: birthday || undefined,
      ...(isPhone ? { phone: raw.trim() } : { email: raw.trim().toLowerCase() })
    };

    const user = await User.create(userData);

    if (!isPhone) {
      sendWelcome(user).catch((err) => console.error('sendWelcome failed:', err.message));
    }

    return res.json({
      token: generateToken(user),
      user: formatUser(user)
    });

  } catch (error) {
    console.error('registerUser:', error);
    return res.status(500).json({ message: 'Registration failed' });
  }
};

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export const loginUser = async (req, res) => {
  try {
    const { password } = req.body;
    // Support both `email` (mobile app) and `identifier` (web — email or phone)
    const raw = req.body.identifier || req.body.email || '';
    const query = identifierQuery(raw);

    if (!query) {
      return res.status(400).json({ message: 'Email or phone required' });
    }

    const user = await User.findOne(query).select('+password');

    if (user?.lockUntil && user.lockUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockUntil - new Date()) / 60000);
      return res.status(423).json({ message: `Account locked. Try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.` });
    }

    if (!user || !(await bcrypt.compare(password, user.password))) {
      if (user) {
        user.loginAttempts = (user.loginAttempts || 0) + 1;
        if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
          user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
          user.loginAttempts = 0;
        }
        await user.save();
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.loginAttempts > 0 || user.lockUntil) {
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      await user.save();
    }

    return res.json({
      token: generateToken(user),
      user: formatUser(user)
    });

  } catch (error) {
    console.error('loginUser:', error);
    return res.status(500).json({ message: 'Login failed' });
  }
};

export const getCurrentUser = async (req, res) => {
  return res.json({ user: formatUser(req.user) });
};

export const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const update = {};
    if (name?.trim()) update.name = name.trim();
    if (phone !== undefined) update.phone = phone.trim() || undefined;

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });
    res.json({ success: true, user: formatUser(user) });
  } catch (err) {
    console.error('updateProfile:', err);
    res.status(500).json({ success: false, message: 'Profile update failed' });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const raw = req.body.identifier || req.body.email || '';
    if (!raw) return res.status(400).json({ success: false, message: 'Email required' });

    const query = identifierQuery(raw);
    const user = query ? await User.findOne(query) : null;
    // Always respond 200 to avoid user enumeration
    if (!user || !user.email) {
      return res.json({ success: true, message: 'If that account exists, an OTP has been sent.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    storeOtp(user.email, otp);
    sendPasswordReset(user, otp).catch((err) => console.error('sendPasswordReset failed:', err.message));

    res.json({ success: true, message: 'If that account exists, an OTP has been sent.' });
  } catch (err) {
    console.error('forgotPassword:', err);
    res.status(500).json({ success: false, message: 'Failed to process request' });
  }
};

export const getAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('addresses');
    res.json({ success: true, data: user?.addresses || [] });
  } catch (err) {
    console.error('getAddresses:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch addresses' });
  }
};

export const saveAddress = async (req, res) => {
  try {
    const { name, line1, line2, city, state, pincode, phone, label, isDefault } = req.body;
    if (!line1 || !city || !state || !pincode) {
      return res.status(400).json({ success: false, message: 'line1, city, state, pincode required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (isDefault) {
      user.addresses.forEach((a) => { a.isDefault = false; });
    }

    user.addresses.push({ name, line1, line2, city, state, pincode, phone, label, isDefault: !!isDefault });
    await user.save();

    res.json({ success: true, data: user.addresses });
  } catch (err) {
    console.error('saveAddress:', err);
    res.status(500).json({ success: false, message: 'Failed to save address' });
  }
};

export const deleteAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const addr = user.addresses.id(req.params.id);
    if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });

    addr.deleteOne();
    await user.save();

    res.json({ success: true, data: user.addresses });
  } catch (err) {
    console.error('deleteAddress:', err);
    res.status(500).json({ success: false, message: 'Failed to delete address' });
  }
};

export const updateAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const addr = user.addresses.id(req.params.id);
    if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });

    const { name, line1, line2, city, state, pincode, phone, label } = req.body;
    if (name    !== undefined) addr.name    = name;
    if (line1   !== undefined) addr.line1   = line1;
    if (line2   !== undefined) addr.line2   = line2;
    if (city    !== undefined) addr.city    = city;
    if (state   !== undefined) addr.state   = state;
    if (pincode !== undefined) addr.pincode = pincode;
    if (phone   !== undefined) addr.phone   = phone;
    if (label   !== undefined) addr.label   = label;

    await user.save();
    res.json({ success: true, data: user.addresses });
  } catch (err) {
    console.error('updateAddress:', err);
    res.status(500).json({ success: false, message: 'Failed to update address' });
  }
};

export const updatePushToken = async (req, res) => {
  try {
    const { expoPushToken } = req.body;
    if (!expoPushToken) return res.status(400).json({ success: false, message: 'expoPushToken required' });
    await User.findByIdAndUpdate(req.user._id, { expoPushToken });
    res.json({ success: true });
  } catch (err) {
    console.error('updatePushToken:', err);
    res.status(500).json({ success: false, message: 'Failed to save push token' });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'email, otp and newPassword required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const valid = verifyOtp(email.toLowerCase().trim(), otp);
    if (!valid) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await User.findOneAndUpdate({ email: email.toLowerCase().trim() }, { password: hashed });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('resetPassword:', err);
    res.status(500).json({ success: false, message: 'Password reset failed' });
  }
};