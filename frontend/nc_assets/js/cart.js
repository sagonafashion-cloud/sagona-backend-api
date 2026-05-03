// cart.js

import { getCart, saveCart } from "./storage.js";

const container = document.getElementById("cart-list");
const totalEl = document.getElementById("cart-total");

// Prevent crash if not on cart page
if (container && totalEl) {
  renderCart();

  document.addEventListener("click", (e) => {
    if (!e.target.classList.contains("remove")) return;

    const id = e.target.dataset.id;
    const updated = getCart().filter(item => item.id !== id);

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

    return `
      <div class="table-row">
        <img src="${item.image}" style="width:60px;height:60px;object-fit:cover;">
        
        <span>${item.name}</span>
        
        <span>₹${item.price}</span>
        
        <span>
          Qty: ${item.quantity}
        </span>

        <span>₹${itemTotal}</span>

        <button class="remove" data-id="${item.id}">Remove</button>
      </div>
    `;
  }).join("");

  totalEl.textContent = `₹${total}`;
}