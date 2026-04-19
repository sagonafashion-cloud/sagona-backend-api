import jwt from "jsonwebtoken";
import User from "../Models/User.js";

export const protect = async (req, res, next) => {
    try {
        let token;

        // ✅ Check header format properly
        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith("Bearer ")
        ) {
            token = req.headers.authorization.split(" ")[1];
        }

        if (!token) {
            return res.status(401).json({ message: "No token" });
        }

        // ✅ IMPORTANT: use SAME secret as login
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || "sagonaSecret"
        );

        // ✅ Fetch user (without password)
        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        req.user = user;

        next();

    } catch (err) {
        console.log("JWT ERROR:", err.message);

        return res.status(401).json({
            message: "Invalid token"
        });
    }
};

export const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === "admin") {
        next();
    } else {
        res.status(403).json({ message: "Admin only" });
    }
};