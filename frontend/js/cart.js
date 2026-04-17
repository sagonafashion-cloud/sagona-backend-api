/* =========================
   SAGONA – CART LOGIC
   Production & Backend Ready
========================= */

document.addEventListener("DOMContentLoaded", () => {
    const cartItemsDiv = document.getElementById("cartItems");
    const totalDiv = document.getElementById("total");
    const loyaltyDiv = document.getElementById("loyaltyPoints");

    if (!cartItemsDiv || !totalDiv) return;

    const cart = getCart();

    if (cart.length === 0) {
        renderEmptyCart(cartItemsDiv);
        return;
    }

    renderCartItems(cart, cartItemsDiv);
    renderTotals(cart, totalDiv, loyaltyDiv);
});

/* =========================
   CART HELPERS
========================= */

function getCart() {
    try {
        return JSON.parse(localStorage.getItem("cart")) || [];
    } catch {
        return [];
    }
}

function renderEmptyCart(container) {
    container.innerHTML = "<p>Your cart is currently empty.</p>";
}

function renderCartItems(cart, container) {
    container.innerHTML = "";

    cart.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "cart-item";

        row.innerHTML = `
      <span class="cart-item-name">${item.name}</span>
      <span class="cart-item-price">₹${item.price}</span>
      <span class="cart-item-qty">Qty: ${item.quantity || 1}</span>
      <button class="remove-btn" data-index="${index}">Remove</button>
    `;

        container.appendChild(row);
    });

    bindRemoveButtons();
}

function renderTotals(cart, totalDiv, loyaltyDiv) {
    const total = cart.reduce((sum, item) => {
        const qty = item.quantity || 1;
        return sum + item.price * qty;
    }, 0);

    totalDiv.textContent = `Total: ₹${total}`;

    if (loyaltyDiv) {
        const points = calculateLoyaltyPoints(total);
        loyaltyDiv.textContent =
            `You will earn ${points} loyalty point(s) after checkout.`;
    }
}

/* =========================
   CART ACTIONS
========================= */

function bindRemoveButtons() {
    document.querySelectorAll(".remove-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const index = btn.dataset.index;
            removeFromCart(index);
        });
    });
}

function removeFromCart(index) {
    const cart = getCart();
    cart.splice(index, 1);
    localStorage.setItem("cart", JSON.stringify(cart));
    location.reload();
}

/* =========================
   LOYALTY (READ ONLY)
========================= */

function calculateLoyaltyPoints(amount) {
    return Math.floor(amount / 100); // 1 point per ₹100
}

/* =========================
   FUTURE BACKEND HOOKS
========================= */

// When checkout is complete:
// - Save order
// - Add loyalty points
// - Clear cart
//
// function completeOrder(orderData) {
//   api.post("/orders", orderData);
// }
