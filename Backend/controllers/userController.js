import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

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