import { request }  from './api.js';
import { getCart, saveCart, getWishlist, saveWishlist } from './storage.js';

/* ── toast helper ── */
function toast(msg, type = '') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast${type ? ' ' + type : ''}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* ── elements ── */
const grid       = document.querySelector('#shop-grid');
const countEl    = document.querySelector('#shop-count');
const searchInput = document.getElementById('search');
const sortSelect  = document.getElementById('sort');

let allProducts = [];

/* ── add to cart ── */
const addToCart = (product) => {
  const cart  = getCart();
  const found = cart.find((i) => i.id === product._id);
  if (found) found.quantity += 1;
  else cart.push({ id: product._id, name: product.name, price: product.price, image: product.image || product.images?.[0], quantity: 1 });
  saveCart(cart);
  toast(`${product.name} added to bag`, 'success');
};

/* ── add to wishlist ── */
const addToWishlist = (product) => {
  const wishlist = getWishlist();
  if (!wishlist.some((item) => item.id === product._id)) {
    wishlist.push({ id: product._id, name: product.name, price: product.price, image: product.image || product.images?.[0] });
    saveWishlist(wishlist);
    toast('Saved to wishlist');
  } else {
    toast('Already in wishlist');
  }
};

/* ── filter + sort ── */
function applyFilters() {
  let products = [...allProducts];

  const search   = (searchInput?.value || '').toLowerCase().trim();
  const sort     = sortSelect?.value || '';
  const price    = document.querySelector('[name="price"]:checked')?.value || '';
  const category = document.querySelector('[name="category"]:checked')?.value || '';

  if (search) {
    products = products.filter((p) =>
      p.name.toLowerCase().includes(search) ||
      (p.description || '').toLowerCase().includes(search) ||
      (p.tags || []).some((t) => t.toLowerCase().includes(search))
    );
  }

  if (category) {
    products = products.filter((p) => p.category === category);
  }

  if (price) {
    if (price.endsWith('+')) {
      const min = Number(price.slice(0, -1));
      products = products.filter((p) => p.price >= min);
    } else {
      const [min, max] = price.split('-').map(Number);
      products = products.filter((p) => p.price >= min && p.price <= max);
    }
  }

  if (sort === 'low')  products.sort((a, b) => a.price - b.price);
  if (sort === 'high') products.sort((a, b) => b.price - a.price);
  if (sort === 'new')  products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  render(products);
}

/* ── render ── */
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function render(products) {
  if (countEl) countEl.textContent = `${products.length} product${products.length !== 1 ? 's' : ''}`;

  if (!products.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:60px 0;text-align:center;color:var(--gray)">No products found.</div>`;
    return;
  }

  grid.innerHTML = products.map((p) => {
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

/* ── events ── */
document.addEventListener('input',  applyFilters);
document.addEventListener('change', applyFilters);

document.addEventListener('click', (e) => {
  const target = e.target.closest('button[data-id]');
  if (!target) return;
  const product = allProducts.find((p) => p._id === target.dataset.id);
  if (!product) return;
  if (target.classList.contains('add'))  addToCart(product);
  if (target.classList.contains('wish')) addToWishlist(product);
});

/* ── init (respects ?category= URL param) ── */
async function init() {
  try {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:60px 0;text-align:center;color:var(--gray);">Loading…</div>`;
    const result = await request('/products');
    // API returns { success, data: [...], total } — extract the array
    allProducts = Array.isArray(result) ? result : (result.data || []);

    // Pre-select category from URL param
    const urlCategory = new URLSearchParams(location.search).get('category');
    if (urlCategory) {
      const radio = document.querySelector(`[name="category"][value="${urlCategory}"]`);
      if (radio) radio.checked = true;
    }

    applyFilters();
  } catch {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:60px 0;text-align:center;color:var(--gray);">Failed to load products.</div>`;
  }
}

init();
