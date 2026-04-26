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
<<<<<<< ours

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
=======
    const featured = products.filter((p) => p.featured).slice(0, 4);
    const displayProducts = featured.length ? featured : products.slice(0, 4);

    featuredContainer.innerHTML = displayProducts
      .map(
        (p) => `
          <article class="card">
            <a href="product.html?id=${p._id}">
              <img src="${p.image}" alt="${p.name}" />
            </a>
            <div class="card-body">
              <h3>${p.name}</h3>
              <p class="price">₹${p.price}</p>
              <div class="card-actions">
                <button class="btn gold add" data-id="${p._id}">Add to Cart</button>
                <button class="btn ghost wish" data-id="${p._id}">Wishlist</button>
              </div>
            </div>
          </article>
        `
      )
      .join('');

    featuredContainer.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-id]');
      if (!button) return;

      const id = button.dataset.id;
      if (!id) return;

      const product = displayProducts.find((p) => p._id === id) || products.find((p) => p._id === id);
      if (!product) return;

      if (button.classList.contains('add')) addToCart(product);
      if (button.classList.contains('wish')) addToWishlist(product);
    });
  } catch (error) {
    featuredContainer.innerHTML = '<p>Unable to load featured products right now.</p>';
>>>>>>> theirs
  }
});

/* =========================
   INIT
========================= */
renderFeatured();