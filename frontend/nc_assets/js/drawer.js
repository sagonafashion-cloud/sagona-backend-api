import { getCart, saveCart } from "./storage.js";

const drawer = document.getElementById("cart-drawer");
const openBtn = document.getElementById("open-cart");
const closeBtn = document.getElementById("close-cart");
const overlay = document.getElementById("cart-overlay");

const itemsContainer = document.getElementById("drawer-items");
const totalEl = document.getElementById("drawer-total");

/* OPEN / CLOSE */
openBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  drawer.classList.add("active");
  renderDrawer();
});

closeBtn?.addEventListener("click", () => {
  drawer.classList.remove("active");
});

overlay?.addEventListener("click", () => {
  drawer.classList.remove("active");
});

/* RENDER */
function renderDrawer() {
  const cart = getCart();

  if (!cart.length) {
    itemsContainer.innerHTML = "<p>Your bag is empty</p>";
    totalEl.textContent = "₹0";
    return;
  }

  let total = 0;

  itemsContainer.innerHTML = cart.map(item => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;

    return `
      <div class="cart-item">
        <img src="${item.image}">
        <div>
          <h4>${item.name}</h4>
          <p>₹${item.price}</p>
          <p>Qty: ${item.quantity}</p>
          <span class="remove-mini" data-id="${item.id}">Remove</span>
        </div>
      </div>
    `;
  }).join("");

  totalEl.textContent = `₹${total}`;
}

/* REMOVE */
itemsContainer?.addEventListener("click", (e) => {
  if (!e.target.classList.contains("remove-mini")) return;

  const id = e.target.dataset.id;
  const updated = getCart().filter(i => i.id !== id);

  saveCart(updated);
  renderDrawer();
});
itemsContainer.addEventListener("click", (e) => {
  const id = e.target.dataset.id;

  let cart = getCart();

  if (e.target.dataset.type === "plus") {
    cart = cart.map(i => i.id === id ? { ...i, quantity: i.quantity + 1 } : i);
  }

  if (e.target.dataset.type === "minus") {
    cart = cart.map(i =>
      i.id === id ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i
    );
  }

  if (e.target.classList.contains("remove-mini")) {
    cart = cart.filter(i => i.id !== id);
  }
  window.addEventListener("hashchange", () => {
    drawer.classList.remove("active");
  });

  saveCart(cart);
  renderDrawer();
});

/* GLOBAL ACCESS */
window.refreshCartDrawer = renderDrawer;