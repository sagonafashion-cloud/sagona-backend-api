import express from "express";
import {
    createOrder,
    getOrders,
    updateOrder
} from "../controllers/orderController.js";

import { protect, admin } from "../middleware/auth.js";

const router = express.Router();

router.post("/", protect, createOrder);
router.get("/", protect, admin, getOrders);
router.put("/:id", protect, admin, updateOrder);

export default router;