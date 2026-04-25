import Razorpay from "razorpay";

export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = "INR", receipt } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return res.status(500).json({ message: "Razorpay is not configured" });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt: receipt || `sagona_${Date.now()}`,
    });

    return res.json(order);
  } catch (error) {
    console.error("paymentController.createRazorpayOrder", error);
    return res.status(500).json({ message: "Unable to create payment order" });
  }
};

export const getRazorpayKey = (_req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) {
    return res.status(500).json({ message: "Razorpay key is not configured" });
  }

  return res.json({ keyId });
};
