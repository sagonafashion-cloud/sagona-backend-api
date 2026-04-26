import { request } from './api.js';
import { getCart, saveCart, getWishlist, saveWishlist } from './storage.js';

const featuredContainer = document.querySelector('#featured-products');

/* =========================
   STATE CACHE (IMPORTANT)
========================= */
let allProducts = [];

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

<<<<<<< ours
<<<<<<< ours
/* =========================
   RENDER PRODUCTS
========================= */
async function renderFeatured() {
  if (!featuredContainer) return;

  featuredContainer.innerHTML = "<p>Loading...</p>";

  try {
    const products = await request('/products');
<<<<<<< ours
    allProducts = products;

    // Prefer featured products, fallback to first 4
    const featured = products.filter(p => p.featured);
    const displayProducts = featured.length ? featured.slice(0, 4) : products.slice(0, 4);

    featuredContainer.innerHTML = displayProducts.map(p => `
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
    `).join("");

  } catch (err) {
    console.error("Product load error:", err);
    featuredContainer.innerHTML = "<p>Failed to load products</p>";
  }
}

/* =========================
   GLOBAL EVENT HANDLER (OPTIMIZED)
========================= */
document.addEventListener("click", (e) => {
  const button = e.target.closest("button[data-id]");
  if (!button) return;

  const id = button.dataset.id;
  if (!id) return;

  const product =
    allProducts.find(p => p._id === id);

  if (!product) return;

  if (button.classList.contains("add")) {
    addToCart(product);
  }

  if (button.classList.contains("wish")) {
    addToWishlist(product);
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
=======
  alert('Added to wishlist');
};

const getDisplayProducts = (products) => {
  const featured = products.filter((product) => product.featured).slice(0, 4);
  return featured.length ? featured : products.slice(0, 4);
};

const renderCards = (products) => products
  .map(
    (product) => `
      <article class="card">
        <a href="product.html?id=${product._id}">
          <img src="${product.image}" alt="${product.name}" />
        </a>
        <div class="card-body">
          <h3>${product.name}</h3>
          <p class="price">₹${product.price}</p>
          <div class="card-actions">
            <button class="btn gold add" data-id="${product._id}">Add to Cart</button>
            <button class="btn ghost wish" data-id="${product._id}">Wishlist</button>
          </div>
        </div>
      </article>
    `
  )
  .join('');

const bindActions = (products) => {
  featuredContainer?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
>>>>>>> theirs

    const product = products.find((item) => item._id === button.dataset.id);
    if (!product) return;

<<<<<<< ours
      const product = displayProducts.find((p) => p._id === id) || products.find((p) => p._id === id);
      if (!product) return;
=======
=======
  alert('Added to wishlist');
};

const getDisplayProducts = (products) => {
  const featured = products.filter((product) => product.featured).slice(0, 4);
  return featured.length ? featured : products.slice(0, 4);
};

const renderCards = (products) => products
  .map(
    (product) => `
      <article class="card">
        <a href="product.html?id=${product._id}">
          <img src="${product.image}" alt="${product.name}" />
        </a>
        <div class="card-body">
          <h3>${product.name}</h3>
          <p class="price">₹${product.price}</p>
          <div class="card-actions">
            <button class="btn gold add" data-id="${product._id}">Add to Cart</button>
            <button class="btn ghost wish" data-id="${product._id}">Wishlist</button>
          </div>
        </div>
      </article>
    `
  )
  .join('');

const bindActions = (products) => {
  featuredContainer?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;

    const product = products.find((item) => item._id === button.dataset.id);
    if (!product) return;

>>>>>>> theirs
    if (button.classList.contains('add')) addToCart(product);
    if (button.classList.contains('wish')) addToWishlist(product);
  });
};
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs

const renderFeatured = async () => {
  if (!featuredContainer) return;
  try {
    const products = await request('/products');
    const displayProducts = getDisplayProducts(products);
    featuredContainer.innerHTML = renderCards(displayProducts);
    bindActions(displayProducts);
  } catch (error) {
    featuredContainer.innerHTML = '<p>Unable to load featured products right now.</p>';
>>>>>>> theirs
  }
});

/* =========================
   INIT
========================= */
renderFeatured();