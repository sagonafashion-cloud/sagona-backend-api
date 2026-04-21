import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },

    // ✅ NEW: CUSTOMER DETAILS
    customer: {
        name: String,
        email: String,
        phone: String
    },

    items: Array,

    total: Number,

    paymentMethod: String,

    address: String,

    // ✅ NEW: ORDER STATUS
    status: {
        type: String,
        enum: ["PENDING", "DELIVERED"],
        default: "PENDING"
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model("Order", orderSchema);