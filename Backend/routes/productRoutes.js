import express from "express";
import {
    getProducts,
    createProduct,
    deleteProduct
} from "../controllers/productController.js";

import { protect, isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getProducts);
router.post("/", protect, isAdmin, createProduct);
router.delete("/:id", protect, isAdmin, deleteProduct);

export default router;