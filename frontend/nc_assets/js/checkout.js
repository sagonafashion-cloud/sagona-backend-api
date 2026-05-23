import { request }  from './api.js';
import { getAuth, getCart, saveCart } from './storage.js';

const form          = document.querySelector('#checkout-form');
const totalEl       = document.querySelector('#checkout-total');
const subtotalEl    = document.querySelector('#checkout-subtotal');
const shippingEl    = document.querySelector('#checkout-shipping');
const gstEl         = document.querySelector('#checkout-gst');
const discountEl    = document.querySelector('#birthday-discount');
const pointsEl      = document.querySelector('#loyalty-points');
const customerNameEl = document.querySelector('#customerName');
const itemsPreview  = document.querySelector('#order-items-preview');

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const GST_RATE = 0.05;
const FREE_SHIP = 999;
const SHIP_CHARGE = 99;

const cart = getCart();
const auth = getAuth();

/* ── guards ── */
if (!auth?.token) {
  alert('Please sign in to continue');
  location.href = 'login.html';
}
if (!cart.length) {
  alert('Your bag is empty');
  location.href = 'shop.html';
}

/* ── init ── */
customerNameEl.value = auth.user?.name || '';
customerNameEl.removeAttribute('readonly');
customerNameEl.removeAttribute('disabled');
if (pointsEl) pointsEl.textContent = auth.user?.loyaltyPoints || 0;

// render mini item list in summary
if (itemsPreview) {
  itemsPreview.innerHTML = cart.map((i) =>
    `<div style="display:flex;justify-content:space-between;padding:4px 0">
      <span>${i.name}${i.size ? ` · ${i.size}` : ''} ×${i.quantity}</span>
      <span>${INR(i.price * i.quantity)}</span>
    </div>`
  ).join('');
}

const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);

/* ── total calculation ── */
function getBirthdayDiscount(dateVal) {
  if (!dateVal) return 0;
  const d   = new Date(dateVal);
  const now = new Date();
  return (d.getDate() === now.getDate() && d.getMonth() === now.getMonth())
    ? Math.round(subtotal * 0.1) : 0;
}

function updateTotal() {
  const discount  = getBirthdayDiscount(document.querySelector('#birthday')?.value);
  const taxable   = Math.max(subtotal - discount, 0);
  const shipping  = taxable >= FREE_SHIP ? 0 : SHIP_CHARGE;
  const gstAmt    = Math.round(taxable * GST_RATE);
  const grand     = taxable + shipping + gstAmt;

  if (discountEl) discountEl.textContent = discount;
  if (subtotalEl) subtotalEl.textContent = INR(subtotal);
  if (shippingEl) shippingEl.innerHTML   = shipping === 0 ? '<span class="free">Free</span>' : INR(shipping);
  if (gstEl)      gstEl.textContent      = INR(gstAmt);
  if (totalEl)    totalEl.textContent    = grand;
}

document.querySelector('#birthday')?.addEventListener('change', updateTotal);
updateTotal();

/* ── build order payload ── */
function buildPayload() {
  const items = cart.map((i) => ({
    productId: i.id,
    name:      i.name,
    qty:       i.quantity,
    size:      i.size    || undefined,
    colour:    i.colour  || undefined
  }));

  const shippingAddress = {
    name:    document.querySelector('#customerName')?.value?.trim() || auth.user?.name,
    phone:   document.querySelector('#phone')?.value?.trim(),
    line1:   document.querySelector('#address')?.value?.trim(),
    line2:   document.querySelector('#address2')?.value?.trim() || undefined,
    city:    document.querySelector('#city')?.value?.trim(),
    state:   document.querySelector('#state')?.value?.trim(),
    pincode: document.querySelector('#pincode')?.value?.trim()
  };

  const discount = getBirthdayDiscount(document.querySelector('#birthday')?.value);
  const method   = document.querySelector('[name="payment"]:checked')?.value || 'COD';

  return { items, shippingAddress, payment: { method }, discount };
}

/* ── place order (COD / post-Razorpay) ── */
async function placeOrder(paymentMethod, razorpayIds = {}) {
  const payload = buildPayload();
  payload.payment = { method: paymentMethod, ...razorpayIds };

  await request('/orders', {
    method: 'POST',
    body:   JSON.stringify(payload)
  });

  saveCart([]);

  // GA4 — purchase
  window._gtag?.('event', 'purchase', {
    transaction_id: Date.now().toString(),
    currency: 'INR',
    value:    Number(totalEl?.textContent || 0),
    items: cart.map((i) => ({
      item_id:   i.id,
      item_name: i.name,
      price:     i.price,
      quantity:  i.quantity
    }))
  });

  location.href = 'order-success.html';
}

/* ── submit ── */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = form.querySelector('[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Placing order…';

  try {
    const method = document.querySelector('[name="payment"]:checked')?.value;

    if (method === 'COD') {
      await placeOrder('COD');
      return;
    }

    /* ── Razorpay flow ── */
    const grand = Number(totalEl.textContent);

    const rzpOrder = await request('/payment/create-order', {
      method: 'POST',
      body:   JSON.stringify({ amount: grand })
    });

    const keyData = await request('/payment/key');

    const rzp = new window.Razorpay({
      key:      keyData.keyId,
      amount:   rzpOrder.amount,
      currency: rzpOrder.currency || 'INR',
      order_id: rzpOrder.id,
      name:     'SAGONA',
      description: 'Premium Kidswear',
      handler: async (response) => {
        try {
          await request('/payment/verify', {
            method: 'POST',
            body: JSON.stringify({
              razorpayOrderId:   response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            })
          });
          await placeOrder('ONLINE', {
            razorpayOrderId:   response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id
          });
        } catch {
          alert('Payment verified but order creation failed. Contact care@sagona.in');
        }
      },
      prefill: {
        name:    auth.user?.name,
        email:   auth.user?.email,
        contact: document.querySelector('#phone')?.value
      },
      theme: { color: '#C9A84C' }
    });

    rzp.on('payment.failed', () => {
      alert('Payment failed. Please try again or use COD.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Place Order';
    });

    rzp.open();

  } catch (err) {
    console.error('checkout:', err);
    alert('Checkout failed. Please try again.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Place Order';
  }
});
