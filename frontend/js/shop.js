import { request } from './api.js';
import { getCart, saveCart, getWishlist, saveWishlist } from './storage.js';

const grid = document.querySelector('#shop-grid');

let products = [];

const addToCart = (p) => {
  const cart = getCart();
  const item = cart.find(i => i.id === p._id);
  if (item) item.quantity++;
  else cart.push({ id: p._id, name: p.name, price: p.price, image: p.image, quantity: 1 });
  saveCart(cart);
};

const addToWishlist = (p) => {
  const list = getWishlist();
  if (!list.some(i => i.id === p._id)) {
    list.push({ id: p._id, name: p.name, price: p.price, image: p.image });
    saveWishlist(list);
  }
};

const render = (items) => items.map(p => `
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

if (grid) {
  try {
    products = await request('/products');
    grid.innerHTML = render(products);

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-id]');
      if (!btn) return;

      const product = products.find(p => p._id === btn.dataset.id);
      if (!product) return;

      if (btn.classList.contains('add')) addToCart(product);
      if (btn.classList.contains('wish')) addToWishlist(product);
    });

  } catch {
    grid.innerHTML = "<p>Unable to load products</p>";
  }
}