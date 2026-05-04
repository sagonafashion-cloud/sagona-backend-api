import { request } from './api.js';
import { getCart, saveCart } from './storage.js';

const wrap = document.querySelector('#product-view');
const id = new URLSearchParams(location.search).get('id');

const addToCart = (p) => {
  const cart = getCart();
  const item = cart.find(i => i.id === p._id);

  if (item) item.quantity++;
  else cart.push({
    id: p._id,
    name: p.name,
    price: p.price,
    image: p.image,
    quantity: 1
  });

  saveCart(cart);

  // auto open drawer
  document.getElementById("cart-drawer")?.classList.add("active");
};

(async () => {
  const p = await request(`/products/${id}`);

  // simulate multi images (you can upgrade backend later)
  const images = [p.image, p.image, p.image];

  wrap.innerHTML = `
    <div class="pdp">

      <!-- GALLERY -->
      <div class="pdp-gallery">
        <img src="${images[0]}" class="main-img" id="main-img">

        <div class="pdp-thumbs">
          ${images.map(img => `
            <img src="${img}" onclick="changeImage('${img}')">
          `).join("")}
        </div>
      </div>

      <!-- INFO -->
      <div class="pdp-info">
        <h1>${p.name}</h1>
        <p class="price">₹${p.price}</p>
        <p class="desc">${p.description}</p>

        <button id="add-btn" class="btn gold">Add to Bag</button>
      </div>

    </div>
  `;

  document.getElementById("add-btn")
    .addEventListener("click", () => addToCart(p));

})();

/* IMAGE SWITCH */
window.changeImage = (src) => {
  document.getElementById("main-img").src = src;
};