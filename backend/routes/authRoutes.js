import express from "express";
import {
    createOrder,
    getOrders,
    updateOrder
} from "../controllers/orderController.js";

import { protect, adminOnly } from "../middleware/auth.js";

const router = express.Router();

router.post("/", protect, createOrder);
router.get("/", protect, adminOnly, getOrders);
router.put("/:id", protect, adminOnly, updateOrder);

export default router;