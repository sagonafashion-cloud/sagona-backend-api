import Order from "../Models/Order.js";

export const createOrder = async (req, res) => {
    try {
        const order = await Order.create(req.body);
        res.json(order);
    } catch {
        res.status(500).json({ message: "Order failed" });
    }
};

export const getUserOrders = async (req, res) => {
    const orders = await Order.find({ userId: req.params.userId });
    res.json(orders);
};