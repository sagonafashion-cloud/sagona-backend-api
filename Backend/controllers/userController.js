import User from "../Models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/* =========================
   REGISTER
========================= */
export const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const exists = await User.findOne({ email });
        if (exists) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashed = await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            email,
            password: hashed,
            role: "user" // ✅ ensure role always exists
        });

        res.json({
            message: "Registered successfully"
        });

    } catch (error) {
        res.status(500).json({ message: "Registration failed" });
    }
};

/* =========================
   LOGIN
========================= */
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(400).json({ message: "Wrong password" });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET || "sagonaSecret",
            { expiresIn: "7d" }
        );

        res.json({
            token,
            name: user.name,
            id: user._id,
            email: user.email
        });

    } catch (error) {
        res.status(500).json({ message: "Login failed" });
    }
};