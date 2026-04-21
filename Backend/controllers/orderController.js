import Order from "../Models/Order.js";

/* =========================
   CREATE ORDER
========================= */
export const createOrder = async (req, res) => {
    try {
        const {
            userId,
            items,
            total,
            paymentMethod,
            address,
            customer
        } = req.body;

        const order = await Order.create({
            userId,
            items,
            total,
            paymentMethod,
            address,
            customer
        });

        res.json({ message: "Order placed", order });

    } catch (err) {
        res.status(500).json({ message: "Order failed" });
    }
};

/* =========================
   GET ALL ORDERS (ADMIN)
========================= */
export const getAllOrders = async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch {
        res.status(500).json({ message: "Failed to fetch orders" });
    }
};

/* =========================
   UPDATE ORDER STATUS
========================= */
export const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;

        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );

        res.json(order);
    } catch {
        res.status(500).json({ message: "Update failed" });
    }
};