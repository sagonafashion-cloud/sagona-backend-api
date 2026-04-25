import { request } from './api.js';
import { getCart, saveCart } from './storage.js';

const id = new URLSearchParams(location.search).get('id');
const wrap = document.querySelector('#product-view');
if (wrap && id) {
  const p = await request(`/products/${id}`);
  wrap.innerHTML = `<div class="layout-2"><img src="${p.image}" alt="${p.name}" style="width:100%;border-radius:14px;height:520px;object-fit:cover"/><div><h1 class="page-title">${p.name}</h1><p class="price">₹${p.price}</p><p>${p.description}</p><button class="btn gold" id="add-btn">Add to Cart</button></div></div>`;
  document.querySelector('#add-btn').addEventListener('click', () => {
    const cart = getCart();
    const found = cart.find((i) => i.id === p._id);
    if (found) found.quantity += 1; else cart.push({ id: p._id, name: p.name, price: p.price, image: p.image, quantity: 1 });
    saveCart(cart);
    alert('Added to cart');
  });
}
