import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `sagona_${Date.now()}`
    });

    return res.json(order);

  } catch (error) {
    console.error("Razorpay:", error);
    return res.status(500).json({ message: "Payment failed" });
  }
};

export const getRazorpayKey = (_req, res) => {
  return res.json({
    keyId: process.env.RAZORPAY_KEY_ID
  });
};