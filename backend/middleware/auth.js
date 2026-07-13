import jwt from "jsonwebtoken";
import User from "../models/User.js";

/* =========================
   PROTECT ROUTES
========================= */
export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) {
      return res.status(401).json({ message: "Account not found" });
    }

    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

/* =========================
   OPTIONAL AUTH
   (attaches user if token present, never blocks)
========================= */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      req.user = await User.findById(decoded.id).select('-password');
    }
  } catch {}
  next();
};

/* =========================
   ADMIN
========================= */
export const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ message: "Admin access required" });
  }
};