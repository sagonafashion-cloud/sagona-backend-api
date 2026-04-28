import { request } from './api.js';
import { getCart, saveCart } from './storage.js';

const wrap = document.querySelector('#product-view');
const id = new URLSearchParams(location.search).get('id');

if (!wrap || !id) throw new Error("Invalid product page");

const addToCart = (product) => {
  const cart = getCart();
  const item = cart.find(i => i.id === product._id);

  if (item) item.quantity++;
  else cart.push({
    id: product._id,
    name: product.name,
    price: product.price,
    image: product.image,
    quantity: 1
  });

  saveCart(cart);
};

(async () => {
  try {
    const p = await request(`/products/${id}`);

    wrap.innerHTML = `
      <div class="layout-2">
        <img src="${p.image}" alt="${p.name}" class="product-img"/>
        <div>
          <h1 class="page-title">${p.name}</h1>
          <p class="price">₹${p.price}</p>
          <p>${p.description}</p>
          <button id="add-btn" class="btn gold">Add to Cart</button>
        </div>
      </div>
    `;

    document.getElementById('add-btn')
      .addEventListener('click', () => addToCart(p));

  } catch {
    wrap.innerHTML = "<p>Product not found</p>";
  }
})();