import { request }  from './api.js';
import { API_BASE, fetchPincodeData } from './config.js';
import { getAuth, getCart, saveCart } from './storage.js';

const form          = document.querySelector('#checkout-form');
const totalEl       = document.querySelector('#checkout-total');
const subtotalEl    = document.querySelector('#checkout-subtotal');
const shippingEl    = document.querySelector('#checkout-shipping');
const gstEl         = document.querySelector('#checkout-gst');
const discountEl    = document.querySelector('#birthday-discount');
const pointsEl      = document.querySelector('#loyalty-points');
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
const customerNameEl = document.querySelector('#ship-name') || document.querySelector('#customerName');
if (customerNameEl) {
  customerNameEl.value = auth?.user?.name || '';
  customerNameEl.removeAttribute('readonly');
  customerNameEl.removeAttribute('disabled');
}
if (pointsEl) pointsEl.textContent = auth?.user?.loyaltyPoints || 0;

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

/* ── pincode autofill ── */
window.autofillAddress = (pincode) => fetchPincodeData(pincode, 'city', 'state', 'pincode-status');

// Auto-trigger when 6 digits typed
document.getElementById('pincode')?.addEventListener('input', function() {
  if (this.value.length === 6) fetchPincodeData(this.value, 'city', 'state', 'pincode-status');
});

/* ── saved addresses ── */
window._savedAddresses = [];

async function loadSavedAddresses() {
  const token = auth?.token;
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/auth/addresses`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const json = await res.json();
    const data = json.data || [];
    if (!data.length) return;
    window._savedAddresses = data;
    const container = document.getElementById('saved-addresses');
    if (!container) return;
    container.innerHTML = `
      <div class="form-group" style="margin-bottom:16px">
        <label>Use saved address</label>
        <select onchange="fillSavedAddress(this.value)"
                style="width:100%;padding:9px;border:0.5px solid #E8E5E0;border-radius:4px;font-size:13px">
          <option value="">Select a saved address…</option>
          ${data.map((a, i) => `<option value="${i}">${a.name} — ${a.line1}, ${a.city}</option>`).join('')}
        </select>
      </div>`;
  } catch {}
}

window.fillSavedAddress = function(index) {
  if (index === '' || !window._savedAddresses.length) return;
  const a = window._savedAddresses[parseInt(index)];
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('ship-name',    a.name);
  set('customerName', a.name);  // fallback id
  set('address-line1', a.line1);
  set('address',      a.line1); // fallback id
  set('address-line2', a.line2);
  set('address2',     a.line2);
  set('city',         a.city);
  set('state',        a.state);
  set('pincode',      a.pincode);
  set('phone',        a.phone);
};

loadSavedAddresses();

/* ── build order payload ── */
function getVal(ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el?.value?.trim()) return el.value.trim();
  }
  return '';
}

function buildPayload() {
  const items = cart.map((i) => ({
    productId: i.id || i._id,
    name:      i.name,
    qty:       i.quantity,
    size:      i.size    || undefined,
    colour:    i.colour  || undefined
  }));

  const shippingAddress = {
    name:    getVal(['ship-name', 'customerName']) || auth?.user?.name || '',
    phone:   getVal(['phone']),
    line1:   getVal(['address-line1', 'address']),
    line2:   getVal(['address-line2', 'address2']) || undefined,
    city:    getVal(['city']),
    state:   getVal(['state']),
    pincode: getVal(['pincode'])
  };

  const discount = getBirthdayDiscount(document.querySelector('#birthday')?.value);
  const method   = document.querySelector('[name="payment"]:checked')?.value || 'COD';

  return {
    items,
    shippingAddress,
    payment: { method },
    discount
  };
}

/* ── place order (COD / post-Razorpay) ── */
async function placeOrder(paymentMethod, razorpayIds = {}) {
  const payload = buildPayload();
  payload.payment = { method: paymentMethod, ...razorpayIds };

  const response = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const msg = errData.message || (errData.errors?.[0]?.msg) || `Order failed: ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();

  // Offer to save address for logged-in users
  if (auth?.token && payload.shippingAddress.line1) {
    const save = confirm('Save this address for future orders?');
    if (save) {
      fetch(`${API_BASE}/auth/addresses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify(payload.shippingAddress)
      }).catch(() => {});
    }
  }

  saveCart([]);

  // GA4 — purchase
  window._gtag?.('event', 'purchase', {
    transaction_id: data.data?.orderNumber || Date.now().toString(),
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
        } catch (err) {
          alert(`Payment verified but order failed: ${err.message}. Contact care@sagona.in`);
        }
      },
      prefill: {
        name:    auth?.user?.name,
        email:   auth?.user?.email,
        contact: document.getElementById('phone')?.value
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
    console.error('checkout error:', err.message);
    alert(`Checkout failed: ${err.message}`);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Place Order';
  }
});
