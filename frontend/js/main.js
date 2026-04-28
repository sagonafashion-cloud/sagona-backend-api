import { request } from './api.js';
import { getCart, saveCart, getWishlist, saveWishlist } from './storage.js';

const container = document.querySelector('#featured-products');
let productsCache = [];

/* =========================
   ACTIONS
========================= */
const addToCart = (product) => {
  const cart = getCart();
  const item = cart.find(i => i.id === product._id);

  if (item) item.quantity++;
  else {
    cart.push({
      id: product._id,
      name: product.name,
      price: product.price,
      image: product.image,
      quantity: 1
    });
  }

  saveCart(cart);
};

const addToWishlist = (product) => {
  const wishlist = getWishlist();

  if (!wishlist.some(i => i.id === product._id)) {
    wishlist.push({
      id: product._id,
      name: product.name,
      price: product.price,
      image: product.image
    });

    saveWishlist(wishlist);
  }
};

/* =========================
   UI RENDER
========================= */
const getDisplayProducts = (products) => {
  const featured = products.filter(p => p.featured);
  return featured.length ? featured.slice(0, 6) : products.slice(0, 6);
};

const render = (products) =>
  products.map(p => `
    <article class="card">
      <a href="product.html?id=${p._id}">
        <img src="${p.image}" alt="${p.name}">
      </a>
      <div class="card-body">
        <h3>${p.name}</h3>
        <p class="price">₹${p.price}</p>
        <div class="card-actions">
          <button class="btn gold add" data-id="${p._id}">Add</button>
          <button class="btn ghost wish" data-id="${p._id}">♡</button>
        </div>
      </div>
    </article>
  `).join("");

/* =========================
   EVENTS
========================= */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;

  const product = productsCache.find(p => p._id === btn.dataset.id);
  if (!product) return;

  if (btn.classList.contains('add')) addToCart(product);
  if (btn.classList.contains('wish')) addToWishlist(product);
});

/* =========================
   INIT
========================= */
(async function init() {
  if (!container) return;

  container.innerHTML = "<p>Loading...</p>";

  try {
    const products = await request('/products');
    productsCache = products;

    const display = getDisplayProducts(products);
    container.innerHTML = render(display);

  } catch {
    container.innerHTML = "<p>Failed to load products</p>";
  }
})();