import { getCart, saveCart } from "./storage.js";

const container = document.getElementById("cart-list");
const totalEl = document.getElementById("cart-total");

function render() {
  const cart = getCart();

  if (!cart.length) {
    container.innerHTML = "<p>Your cart is empty</p>";
    totalEl.textContent = "0";
    return;
  }

  let total = 0;

  container.innerHTML = cart.map(item => {
    total += item.price * item.quantity;

    return `
      <div class="table-row">
        <span>${item.name}</span>
        <span>₹${item.price}</span>
        <span>Qty: ${item.quantity}</span>
        <button class="remove" data-id="${item.id}">Remove</button>
      </div>
    `;
  }).join("");

  totalEl.textContent = total;
}

document.addEventListener("click", (e) => {
  if (!e.target.classList.contains("remove")) return;

  const id = e.target.dataset.id;
  const updated = getCart().filter(i => i.id !== id);

  saveCart(updated);
  render();
});

render();