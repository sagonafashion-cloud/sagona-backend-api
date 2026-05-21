import { request } from "./api.js";
import { getCart, saveCart, getWishlist, saveWishlist } from "./storage.js";
import "./drawer.js";

/* toast helper */
function toast(msg, type = '') {
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
  const el = document.createElement('div');
  el.className = `toast${type ? ' ' + type : ''}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

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
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function renderFeatured(products) {
  const grid = document.getElementById("featured-products");
  if (!grid) return;

  // Show featured first, fall back to newest 4 if none marked featured
  let items = products.filter(p => p.featured);
  if (!items.length) items = [...products].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  items = items.slice(0, 4);

  grid.innerHTML = items.map((p) => {
    const img   = p.images?.[0] || p.image || '';
    const img2  = p.images?.[1] || img;
    const mrp   = p.mrp && p.mrp > p.price ? `<span class="price-mrp">${INR(p.mrp)}</span>` : '';
    const isNew  = (Date.now() - new Date(p.createdAt)) < 15 * 24 * 3600 * 1000;
    const isSale = p.mrp && p.mrp > p.price;
    const badge  = isSale
      ? `<span class="badge badge-sale">Sale</span>`
      : isNew ? `<span class="badge badge-new">New</span>` : '';

    return `
    <article class="product-card">
      ${badge}
      <div class="product-card-media">
        <a href="product.html?id=${p._id}" tabindex="-1" aria-hidden="true">
          <img class="img-main"  src="${img}"  alt="${p.name}" loading="lazy">
          <img class="img-hover" src="${img2}" alt="${p.name}" loading="lazy">
        </a>
        <div class="product-card-actions">
          <button class="btn-quick add" data-id="${p._id}">Add to Bag</button>
          <button class="btn-wish  wish" data-id="${p._id}">♡</button>
        </div>
      </div>
      <div class="product-card-info">
        <a href="product.html?id=${p._id}" class="product-name">${p.name}</a>
        <div class="product-price-row">${INR(p.price)} ${mrp}</div>
      </div>
    </article>`;
  }).join('');
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

/* ADD TO CART / WISHLIST */
document.addEventListener("click", (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;

  e.preventDefault();

  const id      = btn.dataset.id;
  const product = allProducts.find(p => p._id === id);
  if (!product) return;

  /* wishlist */
  if (btn.classList.contains('wish')) {
    const wl = getWishlist();
    if (!wl.some(i => i.id === id)) {
      wl.push({ id, name: product.name, price: product.price, image: product.images?.[0] || product.image || '' });
      saveWishlist(wl);
      toast('Saved to wishlist');
    } else {
      toast('Already in wishlist');
    }
    return;
  }

  if (!btn.classList.contains('add')) return;

  const cart = getCart();
  const item = cart.find(i => i.id === id);

  if (item) item.quantity++;
  else cart.push({
    id,
    name: product.name,
    price: product.price,
    image: product.images?.[0] || product.image || '',
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