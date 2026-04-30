import Razorpay from "razorpay";

/* =========================
   CREATE ORDER
========================= */
export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = "INR", receipt } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    /* 🚨 SAFE CHECK */
    if (!keyId || !keySecret) {
      console.warn("⚠ Razorpay not configured");
      return res.status(500).json({
        message: "Payment service not configured"
      });
    }

    /* ✅ INIT INSIDE FUNCTION */
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt: receipt || `sagona_${Date.now()}`,
    });

    res.json(order);

  } catch (error) {
    console.error("Razorpay error:", error);
    res.status(500).json({ message: "Unable to create payment order" });
  }
};

/* =========================
   GET PUBLIC KEY
========================= */
export const getRazorpayKey = (_req, res) => {
  if (!process.env.RAZORPAY_KEY_ID) {
    return res.status(500).json({
      message: "Razorpay not configured"
    });
  }

  res.json({
    keyId: process.env.RAZORPAY_KEY_ID
  });
};