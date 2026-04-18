import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
    {
        userId: String,
        items: Array,
        total: Number,
        paymentMethod: String,
        address: String
    },
    { timestamps: true }
);

export default mongoose.model("Order", orderSchema);