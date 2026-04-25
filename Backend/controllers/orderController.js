import Order from "../Models/Order.js";
import User from "../Models/User.js";

const toNumber = (value) => Number(value) || 0;

export const createOrder = async (req, res) => {
  try {
    const { items = [], paymentMethod, address, customer, birthday, birthdayDiscount = 0, loyaltyPointsUsed = 0 } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }

    const subTotal = items.reduce((sum, item) => sum + toNumber(item.price) * toNumber(item.quantity || 1), 0);
    const discount = toNumber(birthdayDiscount);
    const finalTotal = Math.max(subTotal - discount, 0);

    const loyaltyPointsEarned = Math.floor(finalTotal / 100);

    const order = await Order.create({
      userId: req.user._id,
      customer,
      items,
      subTotal,
      birthday,
      birthdayDiscount: discount,
      loyaltyPointsUsed: toNumber(loyaltyPointsUsed),
      loyaltyPointsEarned,
      total: finalTotal,
      paymentMethod,
      address,
      status: "PENDING",
    });

    await User.findByIdAndUpdate(req.user._id, { $inc: { loyaltyPoints: loyaltyPointsEarned - toNumber(loyaltyPointsUsed) } });

    return res.status(201).json(order);
  } catch (error) {
    return res.status(500).json({ message: "Unable to create order" });
  }
};

export const getAllOrders = async (_req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch orders" });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["PENDING", "DELIVERED"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json(order);
  } catch (error) {
    return res.status(400).json({ message: "Invalid order id" });
  }
};
