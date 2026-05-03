import { request } from "./api.js";
import { getCart, saveCart } from "./storage.js";
import "./drawer.js";

let allProducts = [];

/* LOAD */
async function loadProducts() {
  const products = await request("/products");
  allProducts = products;

  renderFeatured(products);
  renderShop(products);
}

/* FEATURED */
function renderFeatured(products) {
  const el = document.getElementById("featured-products");
  if (!el) return;

  const featured = products.filter(p => p.featured);

  el.innerHTML = featured.map(p => `
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

/* SHOP */
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