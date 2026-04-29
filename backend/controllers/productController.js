import Product from "../models/Product.js";

export const getProducts = async (_req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    return res.json(products);
  } catch (error) {
    console.error("getProducts:", error);
    return res.status(500).json({ message: "Unable to fetch products" });
  }
};

export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    return res.json(product);
  } catch {
    return res.status(400).json({ message: "Invalid product id" });
  }
};

export const createProduct = async (req, res) => {
  try {
    const { name, price, image, description, featured } = req.body;

    if (!name || !price || !image || !description) {
      return res.status(400).json({ message: "All fields required" });
    }

    const product = await Product.create({
      name,
      price,
      image,
      description,
      featured: !!featured
    });

    return res.status(201).json(product);
  } catch (error) {
    console.error("createProduct:", error);
    return res.status(500).json({ message: "Unable to create product" });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Product not found" });

    return res.json({ message: "Product deleted" });
  } catch {
    return res.status(400).json({ message: "Invalid product id" });
  }
};