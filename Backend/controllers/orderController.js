import Order from "../models/Order.js";
import User from "../models/User.js";

const num = (v) => Number(v) || 0;

export const createOrder = async (req, res) => {
  try {
    const {
      items = [],
      paymentMethod,
      address,
      customer,
      birthday,
      birthdayDiscount = 0
    } = req.body;

    if (!items.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const subTotal = items.reduce(
      (sum, i) => sum + num(i.price) * num(i.quantity || 1),
      0
    );

    const total = Math.max(subTotal - num(birthdayDiscount), 0);

    const loyaltyEarned = Math.floor(total / 100);

    const order = await Order.create({
      userId: req.user._id,
      items,
      total,
      paymentMethod,
      address,
      customer,
      birthday,
      birthdayDiscount,
      loyaltyPointsEarned: loyaltyEarned
    });

    await User.findByIdAndUpdate(req.user._id, {
      $inc: { loyaltyPoints: loyaltyEarned }
    });

    return res.status(201).json(order);

  } catch (error) {
    console.error("createOrder:", error);
    return res.status(500).json({ message: "Order failed" });
  }
};

export const getAllOrders = async (_req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    return res.json(orders);
  } catch {
    return res.status(500).json({ message: "Unable to fetch orders" });
  }
};

export const updateOrderStatus = async (req, res) => {
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

    if (!order) return res.status(404).json({ message: "Order not found" });

    return res.json(order);
  } catch {
    return res.status(400).json({ message: "Invalid order id" });
  }
};