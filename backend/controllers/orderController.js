import Order from "../models/Order.js";
import User from "../models/User.js";

/* =========================
   CREATE ORDER
========================= */
export const createOrder = async (req, res) => {
  try {
    const {
      items = [],
      paymentMethod,
      address,
      customer,
      birthdayDiscount = 0,
      loyaltyPointsUsed = 0
    } = req.body;

    if (!items.length) {
      return res.status(400).json({ message: "Order items required" });
    }

    const subTotal = items.reduce(
      (sum, i) => sum + (Number(i.price) * Number(i.quantity || 1)),
      0
    );

    const discount = Number(birthdayDiscount) || 0;
    const total = Math.max(subTotal - discount, 0);

    const loyaltyEarned = Math.floor(total / 100);

    const order = await Order.create({
      userId: req.user._id,
      customer,
      items,
      subTotal,
      birthdayDiscount: discount,
      loyaltyPointsUsed: Number(loyaltyPointsUsed),
      loyaltyPointsEarned: loyaltyEarned,
      total,
      paymentMethod,
      address,
      status: "PENDING"
    });

    // Update user loyalty
    await User.findByIdAndUpdate(req.user._id, {
      $inc: {
        loyaltyPoints: loyaltyEarned - Number(loyaltyPointsUsed)
      }
    });

    res.status(201).json(order);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Create order failed" });
  }
};

/* =========================
   GET ALL ORDERS (ADMIN)
========================= */
export const getOrders = async (_req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch {
    res.status(500).json({ message: "Fetch orders failed" });
  }
};

/* =========================
   UPDATE ORDER STATUS
========================= */
export const updateOrder = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["PENDING", "DELIVERED"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);

  } catch {
    res.status(400).json({ message: "Update failed" });
  }
};