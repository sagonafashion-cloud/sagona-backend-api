const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    name: String,
    price: Number,
    image: String,
    description: String,
    featured: Boolean
});

module.exports = mongoose.model("Product", productSchema);
const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  image: String,
  description: String,
  featured: Boolean
});

module.exports = mongoose.model("Product", productSchema);
