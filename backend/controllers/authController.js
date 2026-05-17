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

export const registerUser = async (req, res) => {
  try {
    const { name, email, password, birthday } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password: hashed,
      birthday
    });

    sendWelcome(user).catch((err) => console.error('sendWelcome failed:', err.message));

    return res.json({
      token: generateToken(user),
      user: formatUser(user)
    });

  } catch (error) {
    console.error("registerUser:", error);
    return res.status(500).json({ message: "Registration failed" });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    return res.json({
      token: generateToken(user),
      user: formatUser(user)
    });

  } catch (error) {
    console.error("loginUser:", error);
    return res.status(500).json({ message: "Login failed" });
  }
};

export const getCurrentUser = async (req, res) => {
  return res.json({ user: formatUser(req.user) });
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    // Always respond 200 to avoid user enumeration
    if (!user) return res.json({ success: true, message: 'If that email exists, an OTP has been sent.' });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    storeOtp(user.email, otp);
    sendPasswordReset(user, otp).catch((err) => console.error('sendPasswordReset failed:', err.message));

    res.json({ success: true, message: 'If that email exists, an OTP has been sent.' });
  } catch (err) {
    console.error('forgotPassword:', err);
    res.status(500).json({ success: false, message: 'Failed to process request' });
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