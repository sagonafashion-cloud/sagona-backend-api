// cart.js

import { getCart, saveCart } from "./storage.js";

const container = document.getElementById("cart-list");
const totalEl = document.getElementById("cart-total");

// Stable per-variant identifier — mirrors the key product.js writes
const getCartKey = (item) =>
  item.key || item.cartKey || `${item.id || item._id}_${item.size || ''}_${item.colour || ''}`;

// Prevent crash if not on cart page
if (container && totalEl) {
  renderCart();

  document.addEventListener("click", (e) => {
    if (!e.target.classList.contains("remove")) return;

    const keyToRemove = e.target.dataset.key;
    const updated = getCart().filter(item => getCartKey(item) !== keyToRemove);

    saveCart(updated);
    renderCart();
  });
}

function renderCart() {
  const cart = getCart();

  if (!cart.length) {
    container.innerHTML = `
      <div class="empty-cart">
        <p>Your cart is empty</p>
        <a href="shop.html" class="btn gold">Continue Shopping</a>
      </div>
    `;
    totalEl.textContent = "₹0";
    return;
  }

  let total = 0;

  container.innerHTML = cart.map(item => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;
    const label = [item.size, item.colour].filter(Boolean).join(' / ');

    return `
      <div class="table-row">
        <img src="${item.image}" style="width:60px;height:60px;object-fit:cover;">

        <span>${item.name}${label ? ` <span style="font-size:12px;color:#888">(${label})</span>` : ''}</span>

        <span>₹${item.price}</span>

        <span>Qty: ${item.quantity}</span>

        <span>₹${itemTotal}</span>

        <button class="remove" data-key="${getCartKey(item)}">Remove</button>
      </div>
    `;
  }).join("");

  totalEl.textContent = `₹${total}`;
}