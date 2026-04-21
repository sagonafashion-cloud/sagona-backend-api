import express from "express";
import {
    createOrder,
    getAllOrders,
    updateOrderStatus
} from "../controllers/orderController.js";

import { protect, isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

/* USER */
router.post("/", protect, createOrder);

/* ADMIN */
router.get("/", protect, isAdmin, getAllOrders);
router.put("/:id", protect, isAdmin, updateOrderStatus);

export default router;