const express = require("express");
const router = express.Router();

const {
    getProducts,
    createProduct,
    deleteProduct
} = require("../controllers/productController");

const { protect } = require("../middleware/authMiddleware");
const { isAdmin } = require("../middleware/authMiddleware");

/* PUBLIC */
router.get("/", getProducts);

/* ADMIN ONLY */
router.post("/", protect, isAdmin, createProduct);
router.delete("/:id", protect, isAdmin, deleteProduct);

module.exports = router;