const productRoutes = require("./routes/productRoutes");

app.use("/api/products", productRoutes);
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log(err));

app.get("/", (req, res) => {
    res.send("SAGONA API Running");
});

app.listen(process.env.PORT, () => {
    console.log("Server running on port", process.env.PORT);
});
app.use("/api/products", productRoutes);
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);
const orderRoutes = require("./routes/orderRoutes");
app.use("/api/orders", orderRoutes);
app.use("/api/products", require("./routes/productRoutes"));