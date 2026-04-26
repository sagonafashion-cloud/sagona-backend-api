import { request } from './api.js';
import { getCart, saveCart, getWishlist, saveWishlist } from './storage.js';

const featuredContainer = document.querySelector('#featured-products');

/* =========================
   STATE CACHE
========================= */
let allProducts = [];

/* =========================
   ADD TO CART
========================= */
function addToCart(product) {
  const cart = getCart();

  const existing = cart.find(item => item.id === product._id);

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

  const exists = wishlist.some(item => item.id === product._id);

  if (!exists) {
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
   SELECT PRODUCTS TO DISPLAY
========================= */
function getDisplayProducts(products) {
  const featured = products.filter(p => p.featured);
  return featured.length ? featured.slice(0, 4) : products.slice(0, 4);
}

/* =========================
   RENDER PRODUCT CARDS
========================= */
function renderCards(products) {
  return products.map(p => `
    <article class="card">
      <a href="product.html?id=${p._id}">
        <img src="${p.image || 'https://picsum.photos/400/500'}" alt="${p.name}">
      </a>

      <div class="card-body">
        <h3>${p.name}</h3>
        <p class="price">₹${p.price}</p>

        <div class="card-actions">
          <button class="btn gold add" data-id="${p._id}">
            Add to Cart
          </button>

          <button class="btn ghost wish" data-id="${p._id}">
            Wishlist
          </button>
        </div>
      </div>
    </article>
  `).join('');
}

/* =========================
   GLOBAL CLICK HANDLER
========================= */
document.addEventListener("click", (e) => {
  const button = e.target.closest("button[data-id]");
  if (!button) return;

  const id = button.dataset.id;
  if (!id) return;

  const product = allProducts.find(p => p._id === id);
  if (!product) return;

  if (button.classList.contains("add")) {
    addToCart(product);
  }

  if (button.classList.contains("wish")) {
    addToWishlist(product);
  }
});

/* =========================
   LOAD & RENDER PRODUCTS
========================= */
async function renderFeatured() {
  if (!featuredContainer) return;

  featuredContainer.innerHTML = "<p>Loading...</p>";

  try {
    const products = await request('/products');
    allProducts = products;

    const displayProducts = getDisplayProducts(products);

    featuredContainer.innerHTML = renderCards(displayProducts);

  } catch (error) {
    console.error("Error loading products:", error);
    featuredContainer.innerHTML = "<p>Unable to load products</p>";
  }
}

/* =========================
   INIT
========================= */
renderFeatured();