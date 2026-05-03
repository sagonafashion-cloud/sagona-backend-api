import { request } from './api.js';
import { getCart, saveCart, getWishlist, saveWishlist } from './storage.js';

const grid = document.querySelector('#shop-grid');
  
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");
const priceSelect = document.getElementById("price");

let allProducts = [];

/* =========================
   ADD TO CART
========================= */
const addToCart = (product) => {
  const cart = getCart();
  const found = cart.find((i) => i.id === product._id);

  if (found) found.quantity += 1;
  else cart.push({ id: product._id, name: product.name, price: product.price, image: product.image, quantity: 1 });

  saveCart(cart);
  alert('Added to cart');
};

/* =========================
   ADD TO WISHLIST
========================= */
const addToWishlist = (product) => {
  const wishlist = getWishlist();

  if (!wishlist.some((item) => item.id === product._id)) {
    wishlist.push({ id: product._id, name: product.name, price: product.price, image: product.image });
    saveWishlist(wishlist);
  }

  alert('Added to wishlist');
};

/* =========================
   FILTER LOGIC
========================= */
function applyFilters() {
  let products = [...allProducts];

  const search = searchInput.value.toLowerCase();
  const sort = sortSelect.value;
  const price = priceSelect.value;

  // 🔍 SEARCH
  if (search) {
    products = products.filter(p =>
      p.name.toLowerCase().includes(search)
    );
  }

  // 💰 PRICE FILTER
  if (price) {
    if (price === "10000+") {
      products = products.filter(p => p.price >= 10000);
    } else {
      const [min, max] = price.split("-").map(Number);
      products = products.filter(p => p.price >= min && p.price <= max);
    }
  }

  // 🔃 SORT
  if (sort === "low") {
    products.sort((a, b) => a.price - b.price);
  }

  if (sort === "high") {
    products.sort((a, b) => b.price - a.price);
  }

  render(products);
}

/* =========================
   RENDER
========================= */
function render(products) {
  grid.innerHTML = products.map(p => `
    <article class="card">

      <a href="product.html?id=${p._id}">
        <img src="${p.image}" alt="${p.name}">
      </a>

      <!-- HOVER ACTION -->
      <div class="card-overlay">
        <button class="btn gold add" data-id="${p._id}">Add</button>
        <button class="btn ghost wish" data-id="${p._id}">♡</button>
      </div>

      <div class="card-body">
        <h3>${p.name}</h3>
        <p class="price">₹${p.price}</p>
      </div>

    </article>
  `).join('');
}

/* =========================
   EVENTS
========================= */
document.addEventListener("input", applyFilters);
document.addEventListener("change", applyFilters);

document.addEventListener("click", (event) => {
  const target = event.target.closest('button[data-id]');
  if (!target) return;

  const product = allProducts.find(p => p._id === target.dataset.id);
  if (!product) return;

  if (target.classList.contains('add')) addToCart(product);
  if (target.classList.contains('wish')) addToWishlist(product);
});

/* =========================
   LOAD PRODUCTS
========================= */
async function init() {
  try {
    const products = await request('/products');
    allProducts = products;
    render(products);
  } catch {
    grid.innerHTML = "<p>Error loading products</p>";
  }
}

init();