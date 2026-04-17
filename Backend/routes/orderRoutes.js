const express = require("express");
const router = express.Router();
const Order = require("../Models/Order");

// CREATE ORDER
router.post("/", async (req, res) => {
    try {
        const order = await Order.create(req.body);
        res.json({ message: "Order placed successfully", order });
    } catch (err) {
        res.status(500).json({ message: "Order failed" });
    }
});

// GET USER ORDERS
router.get("/:userId", async (req, res) => {
    const orders = await Order.find({ userId: req.params.userId });
    res.json(orders);
});

module.exports = router;
const { protect, isAdmin } = require("../middleware/authMiddleware");

router.get("/", protect, isAdmin, getAllOrders);