import { request } from './api.js';
import { getCart, saveCart, getWishlist, saveWishlist } from './storage.js';

const featuredContainer = document.querySelector('#featured-products');

const addToCart = (product) => {
  const cart = getCart();
  const existing = cart.find((i) => i.id === product._id);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ id: product._id, name: product.name, price: product.price, image: product.image, quantity: 1 });
  }

  saveCart(cart);
  alert('Added to cart');
};

const addToWishlist = (product) => {
  const wishlist = getWishlist();

  if (!wishlist.some((item) => item.id === product._id)) {
    wishlist.push({ id: product._id, name: product.name, price: product.price, image: product.image });
    saveWishlist(wishlist);
  }

  alert('Added to wishlist');
};

const renderFeatured = async () => {
  if (!featuredContainer) return;

  try {
    const products = await request('/products');
    const featured = products.filter((p) => p.featured).slice(0, 4);

    featuredContainer.innerHTML = featured
      .map(
        (p) => `
          <article class="card">
            <a href="product.html?id=${p._id}">
              <img src="${p.image}" alt="${p.name}" />
            </a>
            <div class="card-body">
              <h3>${p.name}</h3>
              <p class="price">₹${p.price}</p>
              <button class="btn gold add" data-id="${p._id}">Add to Cart</button>
              <button class="btn ghost wish" data-id="${p._id}">Wishlist</button>
            </div>
          </article>
        `
      )
      .join('');

    featuredContainer.addEventListener('click', (event) => {
      const id = event.target.dataset.id;
      const product = products.find((p) => p._id === id);
      if (!product) return;

      if (event.target.classList.contains('add')) addToCart(product);
      if (event.target.classList.contains('wish')) addToWishlist(product);
    });
  } catch (error) {
    featuredContainer.innerHTML = '<p>Unable to load featured products right now.</p>';
  }
};

renderFeatured();
