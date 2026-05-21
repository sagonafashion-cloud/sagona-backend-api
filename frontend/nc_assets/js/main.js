import { request } from "./api.js";
import { getCart, saveCart } from "./storage.js";
import "./drawer.js";

let allProducts = [];

/* LOAD */
async function loadProducts() {
  const result = await request("/products");
  // API returns { success, data: [...], total } — extract the array
  const products = Array.isArray(result) ? result : (result.data || []);
  allProducts = products;

  renderFeatured(products);
  renderShop(products);
}

/* FEATURED — renders to #featured-products on index.html */
function renderFeatured(products) {
  const grid = document.getElementById("featured-products");
  if (!grid) return;

  grid.innerHTML = products
    .filter(p => p.featured)
    .slice(0, 4)
    .map((p, i) => `
    <a href="product.html?id=${p._id}" class="card fade-in" style="animation-delay:${i * 0.05}s">

      <img class="first" src="${p.image}">
      <img class="second" src="${p.image}">

      <div class="card-overlay">
        <button class="btn gold add" data-id="${p._id}">Add</button>
      </div>

      <div class="card-body">
        <h3>${p.name}</h3>
        <p class="price">₹${p.price}</p>
      </div>

    </a>
  `).join("");
}

/* SHOP — renders to #shop-grid (used by pages that include both) */
function renderShop(products) {
  const grid = document.getElementById("shop-grid");
  if (!grid) return;

  grid.innerHTML = products.map(p => `
    <a href="product.html?id=${p._id}" class="card">

      <img src="${p.image}">

      <div class="card-overlay">
        <button class="btn gold add" data-id="${p._id}">Add</button>
      </div>

      <div class="card-body">
        <h3>${p.name}</h3>
        <p class="price">₹${p.price}</p>
      </div>

    </a>
  `).join("");
}

/* ADD TO CART */
document.addEventListener("click", (e) => {
  if (!e.target.classList.contains("add")) return;

  e.preventDefault();

  const id = e.target.dataset.id;
  const product = allProducts.find(p => p._id === id);

  const cart = getCart();
  const item = cart.find(i => i.id === id);

  if (item) item.quantity++;
  else cart.push({
    id,
    name: product.name,
    price: product.price,
    image: product.image,
    quantity: 1
  });

  saveCart(cart);

  document.getElementById("cart-drawer")?.classList.add("active");

  if (window.refreshCartDrawer) {
    window.refreshCartDrawer();
  }
});

/* INIT */
loadProducts();