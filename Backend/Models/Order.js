import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    customer: {
      name: String,
      email: String,
      phone: String,
    },
    items: { type: Array, required: true },
    subTotal: { type: Number, default: 0 },
    birthday: { type: String, default: "" },
    birthdayDiscount: { type: Number, default: 0 },
    loyaltyPointsUsed: { type: Number, default: 0 },
    loyaltyPointsEarned: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentMethod: { type: String, required: true },
    address: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "DELIVERED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);
