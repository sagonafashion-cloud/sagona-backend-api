import { request } from './api.js';
import { getAuth, getCart, saveCart } from './storage.js';

const form = document.querySelector('#checkout-form');
const totalEl = document.querySelector('#checkout-total');
const discountEl = document.querySelector('#birthday-discount');
const pointsEl = document.querySelector('#loyalty-points');
const customerNameEl = document.querySelector('#customerName');

const cart = getCart();
const auth = getAuth();

/* =========================
   PROTECTION
========================= */
if (!auth || !auth.token) {
  alert("Please login first");
  location.href = 'login.html';
}

if (!cart.length) {
  alert('Cart is empty');
  location.href = 'shop.html';
}

/* =========================
   INIT DATA
========================= */
customerNameEl.value = auth.user?.name || "";

const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

pointsEl.textContent = auth.user?.loyaltyPoints || 0;

/* =========================
   DISCOUNT
========================= */
function getBirthdayDiscount(date) {
  if (!date) return 0;

  const d = new Date(date);
  const now = new Date();

  if (d.getDate() === now.getDate() && d.getMonth() === now.getMonth()) {
    return Math.round(subtotal * 0.1);
  }

  return 0;
}

function updateTotal() {
  const birthday = document.querySelector('#birthday').value;
  const discount = getBirthdayDiscount(birthday);

  discountEl.textContent = discount;
  totalEl.textContent = Math.max(subtotal - discount, 0);
}

document.querySelector('#birthday').addEventListener('change', updateTotal);
updateTotal();

/* =========================
   PLACE ORDER
========================= */
async function placeOrder(paymentMethod) {
  const birthday = document.querySelector('#birthday').value;

  const order = await request('/orders', {
    method: 'POST',
    body: JSON.stringify({
      items: cart,
      paymentMethod,
      address: document.querySelector('#address').value,
      phone: document.querySelector('#phone').value,
      birthday,
      customer: {
        name: auth.user.name,
        email: auth.user.email
      }
    })
  });

  saveCart([]);
  location.href = 'order-success.html';
}

/* =========================
   SUBMIT
========================= */
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    const method = document.querySelector('#paymentMethod').value;

    if (method === "COD") {
      await placeOrder("COD");
      return;
    }

    /* ===== RAZORPAY FLOW ===== */
    const amount = Number(totalEl.textContent);

    const order = await request('/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({ amount })
    });

    const key = await request('/payment/key');

    const rzp = new window.Razorpay({
      key: key.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.id,
      name: "SAGONA",

      handler: async function () {
        await placeOrder("ONLINE");
      },

      prefill: {
        name: auth.user.name,
        email: auth.user.email
      },

      theme: {
        color: "#b58a42"
      }
    });

    rzp.open();

  } catch (err) {
    console.error(err);
    alert("Checkout failed");
  }
});