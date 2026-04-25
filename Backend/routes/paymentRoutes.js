import express from "express";
import { createRazorpayOrder, getRazorpayKey } from "../controllers/paymentController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/key", getRazorpayKey);
router.post("/create-order", protect, createRazorpayOrder);

export default router;
