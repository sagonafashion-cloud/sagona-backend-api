import { getCart, saveCart } from './storage.js';

const container = document.querySelector('#cart-list');
const totalEl = document.querySelector('#cart-total');

const render = () => {
  const cart = getCart();
  if (!container) return;
  if (!cart.length) {
    container.innerHTML = '<p>Your cart is empty.</p>';
    totalEl.textContent = '0';
    return;
  }

  container.innerHTML = cart.map((item, idx) => `<div class="table-row"><span>${item.name} x ${item.quantity}</span><span>₹${item.price * item.quantity}</span><button class="btn ghost remove" data-idx="${idx}">Remove</button></div>`).join('');
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  totalEl.textContent = String(total);
};

container?.addEventListener('click', (e) => {
  if (!e.target.classList.contains('remove')) return;
  const cart = getCart();
  cart.splice(Number(e.target.dataset.idx), 1);
  saveCart(cart);
  render();
});

render();
