import { request } from './api.js';
import { getAuth, getCart, saveCart } from './storage.js';
import { RAZORPAY_KEY_ID } from './config.js';

const form = document.querySelector('#checkout-form');
const totalEl = document.querySelector('#checkout-total');
const discountEl = document.querySelector('#birthday-discount');
const pointsEl = document.querySelector('#loyalty-points');
const customerNameEl = document.querySelector('#customerName');

const cart = getCart();
const auth = getAuth();

if (!auth) {
  location.href = 'login.html';
}

if (!cart.length) {
  alert('Your cart is empty. Add products before checkout.');
  location.href = 'shop.html';
}

if (customerNameEl && auth?.user?.name) {
  customerNameEl.value = auth.user.name;
}

const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
const loyaltyPoints = auth?.user?.loyaltyPoints || 0;
pointsEl.textContent = String(loyaltyPoints);

const discountForBirthday = (birthday) => {
  if (!birthday) return 0;
  const date = new Date(birthday);
  const now = new Date();
  const isBirthday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth();
  return isBirthday ? Math.round(subtotal * 0.1) : 0;
};

const updateSummary = () => {
  const birthday = document.querySelector('#birthday').value;
  const discount = discountForBirthday(birthday);
  discountEl.textContent = String(discount);
  totalEl.textContent = String(Math.max(subtotal - discount, 0));
};

document.querySelector('#birthday')?.addEventListener('change', updateSummary);
updateSummary();

const placeOrder = async (paymentMethod) => {
  const birthday = document.querySelector('#birthday').value;
  const birthdayDiscount = discountForBirthday(birthday);

  await request('/orders', {
    method: 'POST',
    body: JSON.stringify({
      items: cart,
      paymentMethod,
      address: document.querySelector('#address').value,
      birthday,
      birthdayDiscount,
      customer: {
        name: auth.user.name,
        email: auth.user.email,
        phone: document.querySelector('#phone').value,
      },
    }),
  });

  saveCart([]);
  location.href = 'order-success.html';
};

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const method = document.querySelector('#paymentMethod').value;
    if (method === 'COD') {
      await placeOrder('COD');
      return;
    }

    const amount = Number(totalEl.textContent);
    const razorpayOrder = await request('/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });

    if (!window.Razorpay || !RAZORPAY_KEY_ID) {
      alert('Razorpay not configured. Set SAGONA_RAZORPAY_KEY_ID in localStorage first.');
      return;
    }

    const rz = new window.Razorpay({
      key: RAZORPAY_KEY_ID,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      name: 'SAGONA',
      order_id: razorpayOrder.id,
      handler: async () => placeOrder('ONLINE'),
      prefill: {
        name: auth.user.name,
        email: auth.user.email,
      },
      theme: { color: '#b58a42' },
    });

    rz.open();
  } catch (error) {
    alert(error.message || 'Checkout failed');
  }
});
