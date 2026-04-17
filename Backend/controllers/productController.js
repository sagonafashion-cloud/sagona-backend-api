exports.createProduct = async (req, res) => {
    try {
        const product = await Product.create(req.body);
        res.json(product);
    } catch {
        res.status(500).json({ message: "Error creating product" });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: "Product deleted" });
    } catch {
        res.status(500).json({ message: "Delete failed" });
    }
};