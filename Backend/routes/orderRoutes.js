import express from "express";
const router = express.Router();

import Order from "../Models/Order.js";
import { protect, isAdmin } from "../middleware/authMiddleware.js";

/* =========================
   CREATE ORDER (PUBLIC / USER)
========================= */
router.post("/", async (req, res) => {
    try {
        const order = await Order.create(req.body);
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: "Order failed" });
    }
});

/* =========================
   GET ALL ORDERS (ADMIN ONLY) 🔥
========================= */
router.get("/", protect, isAdmin, async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch orders" });
    }
});

/* =========================
   GET USER ORDERS
========================= */
router.get("/:userId", async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.params.userId });
        res.json(orders);
    } catch {
        res.status(500).json({ message: "Error fetching user orders" });
    }
});

export default router;