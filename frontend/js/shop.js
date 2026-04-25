<<<<<<< ours
<<<<<<< ours
const API = "https://sagona-backend-api.onrender.com/api/products";

async function loadProducts() {
    const res = await fetch(API);
    const data = await res.json();

    const container = document.getElementById("products");
    container.innerHTML = "";

    data.forEach(p => {
        const img = p.image || "https://picsum.photos/400/500"; // ✅ FIX placeholder error

        container.innerHTML += `
            <div class="product">
                <img src="${img}">
                <h3>${p.name}</h3>
                <p>₹${p.price}</p>
                <button onclick='addToCart(${JSON.stringify(p)})'>
                    Add to Cart
                </button>
            </div>
        `;
    });
}

function addToCart(product) {
    let cart = JSON.parse(localStorage.getItem("cart")) || [];
    cart.push(product);
    localStorage.setItem("cart", JSON.stringify(cart));
    alert("Added to cart");
}

loadProducts();
=======
import { request } from './api.js';
import { getCart, saveCart, getWishlist, saveWishlist } from './storage.js';

const grid = document.querySelector('#shop-grid');

const addToCart = (product) => {
  const cart = getCart();
  const found = cart.find((i) => i.id === product._id);
  if (found) found.quantity += 1;
  else cart.push({ id: product._id, name: product.name, price: product.price, image: product.image, quantity: 1 });
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

if (grid) {
  try {
    const products = await request('/products');

    grid.innerHTML = products
      .map(
        (p) => `
          <article class="card">
            <a href="product.html?id=${p._id}"><img src="${p.image}" alt="${p.name}"/></a>
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

    grid.addEventListener('click', (event) => {
      const target = event.target;
      const product = products.find((p) => p._id === target.dataset.id);
      if (!product) return;

      if (target.classList.contains('add')) addToCart(product);
      if (target.classList.contains('wish')) addToWishlist(product);
    });
  } catch (error) {
    grid.innerHTML = '<p>Unable to load products right now.</p>';
  }
}
>>>>>>> theirs
=======
import { request } from './api.js';
import { getCart, saveCart, getWishlist, saveWishlist } from './storage.js';

const grid = document.querySelector('#shop-grid');

const addToCart = (product) => {
  const cart = getCart();
  const found = cart.find((i) => i.id === product._id);
  if (found) found.quantity += 1;
  else cart.push({ id: product._id, name: product.name, price: product.price, image: product.image, quantity: 1 });
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

if (grid) {
  try {
    const products = await request('/products');

    grid.innerHTML = products
      .map(
        (p) => `
          <article class="card">
            <a href="product.html?id=${p._id}"><img src="${p.image}" alt="${p.name}"/></a>
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

    grid.addEventListener('click', (event) => {
      const target = event.target;
      const product = products.find((p) => p._id === target.dataset.id);
      if (!product) return;

      if (target.classList.contains('add')) addToCart(product);
      if (target.classList.contains('wish')) addToWishlist(product);
    });
  } catch (error) {
    grid.innerHTML = '<p>Unable to load products right now.</p>';
  }
}
>>>>>>> theirs
