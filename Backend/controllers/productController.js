import Product from "../Models/Product.js";

export const getProducts = async (req, res) => {
    const products = await Product.find();
    res.json(products);
};

export const createProduct = async (req, res) => {
    try {
        const product = await Product.create(req.body);
        res.json(product);
    } catch {
        res.status(500).json({ message: "Error creating product" });
    }
};

export const deleteProduct = async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: "Product deleted" });
    } catch {
        res.status(500).json({ message: "Delete failed" });
    }
};