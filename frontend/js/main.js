import { request } from './api.js';
import { getCart, saveCart, getWishlist, saveWishlist } from './storage.js';

const featuredContainer = document.querySelector('#featured-products');

/* =========================
   ADD TO CART
========================= */
function addToCart(product) {
  const cart = getCart();

  const existing = cart.find(i => i.id === product._id);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id: product._id,
      name: product.name,
      price: product.price,
      image: product.image || "https://picsum.photos/400/500",
      quantity: 1
    });
  }

  saveCart(cart);
  alert("Added to cart");
}

/* =========================
   ADD TO WISHLIST
========================= */
function addToWishlist(product) {
  const wishlist = getWishlist();

  if (!wishlist.some(i => i.id === product._id)) {
    wishlist.push({
      id: product._id,
      name: product.name,
      price: product.price,
      image: product.image || "https://picsum.photos/400/500"
    });

    saveWishlist(wishlist);
    alert("Added to wishlist");
  } else {
    alert("Already in wishlist");
  }
}

/* =========================
   RENDER PRODUCTS
========================= */
async function renderFeatured() {
  if (!featuredContainer) return;

  featuredContainer.innerHTML = "<p>Loading...</p>";

  try {
    const products = await request('/products');

    const display = products.slice(0, 4);

    featuredContainer.innerHTML = display.map(p => `
      <article class="card">
        <img src="${p.image || 'https://picsum.photos/400/500'}">
        <div class="card-body">
          <h3>${p.name}</h3>
          <p class="price">₹${p.price}</p>

          <button class="btn gold add" data-id="${p._id}">
            Add to Cart
          </button>

          <button class="btn ghost wish" data-id="${p._id}">
            Wishlist
          </button>
        </div>
      </article>
    `).join("");

  } catch (err) {
    console.error(err);
    featuredContainer.innerHTML = "<p>Failed to load products</p>";
  }
}

/* =========================
   EVENTS (GLOBAL SAFE)
========================= */
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const id = btn.dataset.id;
  if (!id) return;

  try {
    const products = await request('/products');
    const product = products.find(p => p._id === id);

    if (!product) return;

    if (btn.classList.contains("add")) addToCart(product);
    if (btn.classList.contains("wish")) addToWishlist(product);

  } catch (err) {
    console.error("Action error:", err);
  }
});

/* =========================
   INIT
========================= */
renderFeatured();