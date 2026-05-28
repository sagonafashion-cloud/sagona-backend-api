import { API_BASE, fetchPincodeData } from './config.js';
import { getToken, getUser, saveUser, clearAuth } from './storage.js';

const token = getToken();
if (!token) {
  location.href = 'login.html?next=account.html';
}

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const STATUS_COLOR = {
  placed:    { bg: '#dbeafe', text: '#1e40af' },
  confirmed: { bg: '#dcfce7', text: '#15803d' },
  packed:    { bg: '#ede9fe', text: '#6d28d9' },
  shipped:   { bg: '#fef3c7', text: '#b45309' },
  delivered: { bg: '#dcfce7', text: '#15803d' },
  returned:  { bg: '#f3f4f6', text: '#4b5563' },
  cancelled: { bg: '#fee2e2', text: '#b91c1c' },
};

function statusBadge(status) {
  const s  = (status || 'placed').toLowerCase();
  const c  = STATUS_COLOR[s] || { bg: '#f3f4f6', text: '#374151' };
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:500;background:${c.bg};color:${c.text}">${label}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showToast(msg) {
  const tc = document.getElementById('toast-container');
  if (!tc) { alert(msg); return; }
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'background:#0A0A0A;color:#fff;padding:12px 20px;border-radius:6px;font-size:13px;margin-top:8px;opacity:1;transition:opacity 0.3s';
  tc.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
}

const authHeader = () => ({ Authorization: `Bearer ${token}` });

/* ── navigation ── */
const sections = ['profile', 'orders', 'addresses', 'wishlist', 'loyalty'];

function activateTab(id) {
  sections.forEach((s) => {
    document.getElementById(`tab-${s}`)?.classList.toggle('acct-tab-active', s === id);
    const sec = document.getElementById(`sec-${s}`);
    if (sec) sec.style.display = s === id ? 'block' : 'none';
  });
}

document.querySelectorAll('.acct-tab').forEach((el) => {
  el.addEventListener('click', () => activateTab(el.dataset.tab));
});

activateTab('profile');

/* ══════════════════════════════════════════
   PROFILE
══════════════════════════════════════════ */
let user = getUser() || {};

function renderProfile() {
  document.getElementById('prof-name').textContent   = user.name  || '—';
  document.getElementById('prof-email').textContent  = user.email || user.phone || '—';
  document.getElementById('prof-points').textContent = user.loyaltyPoints ?? 0;
}

renderProfile();

fetch(`${API_BASE}/auth/me`, { headers: authHeader() })
  .then((r) => r.json())
  .then((d) => { if (d.user) { user = d.user; saveUser(user); renderProfile(); } })
  .catch(() => {});

document.getElementById('prof-edit-btn').addEventListener('click', () => {
  document.getElementById('prof-display').style.display = 'none';
  document.getElementById('prof-form').style.display    = 'block';
  document.getElementById('edit-name').value  = user.name  || '';
  document.getElementById('edit-phone').value = user.phone || '';
});

document.getElementById('prof-cancel-btn').addEventListener('click', () => {
  document.getElementById('prof-display').style.display = 'block';
  document.getElementById('prof-form').style.display    = 'none';
});

document.getElementById('prof-save-btn').addEventListener('click', async () => {
  const btn   = document.getElementById('prof-save-btn');
  const name  = document.getElementById('edit-name').value.trim();
  const phone = document.getElementById('edit-phone').value.trim();
  if (!name) { alert('Name is required'); return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const res  = await fetch(`${API_BASE}/auth/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ name, phone })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Update failed');
    user = { ...user, ...data.user };
    saveUser(user);
    renderProfile();
    document.getElementById('prof-display').style.display = 'block';
    document.getElementById('prof-form').style.display    = 'none';
    showToast('Profile updated');
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
});

/* ══════════════════════════════════════════
   ORDERS — FIX 1: actions per status
══════════════════════════════════════════ */
function getOrderActions(order) {
  const status = (order.status || '').toLowerCase();
  const lastUpdate = order.updatedAt ? new Date(order.updatedAt) : null;
  const daysSince  = lastUpdate ? Math.floor((Date.now() - lastUpdate) / 86400000) : 999;
  const inWindow   = daysSince <= 7;

  let html = '';

  if (status === 'placed' || status === 'confirmed') {
    html += `
      <button onclick="cancelOrder('${order._id}','${order.orderNumber}')"
              style="padding:8px 18px;background:transparent;border:0.5px solid #E24B4A;
                     color:#E24B4A;cursor:pointer;font-size:11px;letter-spacing:0.08em;border-radius:3px">
        CANCEL ORDER
      </button>`;
  }

  if (status === 'shipped') {
    const trackId = order.shipments?.[0]?.trackingId;
    if (trackId) {
      html += `
        <a href="https://shiprocket.co/tracking/${trackId}" target="_blank" rel="noopener"
           style="padding:8px 18px;background:transparent;border:0.5px solid #555;color:#555;
                  text-decoration:none;font-size:11px;letter-spacing:0.08em;border-radius:3px;display:inline-block">
          TRACK ORDER
        </a>`;
    }
  }

  if (status === 'delivered' && inWindow) {
    html += `
      <button onclick="requestReturn('${order._id}','return')"
              style="padding:8px 18px;background:transparent;border:0.5px solid #555;color:#555;
                     cursor:pointer;font-size:11px;letter-spacing:0.08em;border-radius:3px">
        RETURN
      </button>
      <button onclick="requestReturn('${order._id}','replace')"
              style="padding:8px 18px;background:#0A0A0A;border:0.5px solid #0A0A0A;color:#fff;
                     cursor:pointer;font-size:11px;letter-spacing:0.08em;border-radius:3px">
        REPLACE
      </button>`;
  }

  if (status === 'delivered' && !inWindow) {
    html += `<span style="font-size:11px;color:#999">Return window closed (7 days)</span>`;
  }

  return html
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:0.5px solid #E8E5E0">${html}</div>`
    : '';
}

window.cancelOrder = async function(orderId, orderNumber) {
  if (!confirm(`Cancel order ${orderNumber}? This cannot be undone.`)) return;
  try {
    const res  = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Order cancelled successfully');
      loadOrders();
    } else {
      alert(data.message || 'Could not cancel order');
    }
  } catch (err) {
    alert('Failed: ' + err.message);
  }
};

window.requestReturn = async function(orderId, type) {
  const label  = type === 'replace' ? 'replacing' : 'returning';
  const reason = prompt(`Please state your reason for ${label} this item:`);
  if (!reason) return;
  try {
    const res  = await fetch(`${API_BASE}/orders/${orderId}/return-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ returnType: type, reason })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
    } else {
      alert(data.message || 'Request failed');
    }
  } catch (err) {
    alert('Failed: ' + err.message);
  }
};

async function loadOrders() {
  const container = document.getElementById('orders-list');
  container.innerHTML = '<p style="color:var(--gray)">Loading orders…</p>';

  try {
    const res    = await fetch(`${API_BASE}/orders/my`, { headers: authHeader() });
    const data   = await res.json();
    const orders = data.data || [];

    if (!orders.length) {
      container.innerHTML = '<p style="color:var(--gray)">No orders yet. <a href="shop.html" style="color:var(--gold)">Start shopping →</a></p>';
      return;
    }

    container.innerHTML = orders.map((o) => {
      const itemCount = (o.items || []).reduce((s, i) => s + (i.qty || 1), 0);
      const total     = o.billing?.grandTotal ?? 0;
      return `
        <div class="acct-order-card" data-id="${o._id}">
          <div class="acct-order-header" onclick="toggleOrder('${o._id}')">
            <div>
              <p class="acct-order-num">${o.orderNumber || '—'}</p>
              <p class="acct-order-meta">${fmtDate(o.createdAt)} · ${itemCount} item${itemCount !== 1 ? 's' : ''}</p>
            </div>
            <div style="text-align:right">
              ${statusBadge(o.status)}
              <p style="margin-top:6px;font-weight:500;font-size:15px">${INR(total)}</p>
            </div>
          </div>
          <div class="acct-order-items" id="order-items-${o._id}" style="display:none">
            ${(o.items || []).map((item) => `
              <div class="acct-item-row">
                <span>${item.name}${item.size ? ` · ${item.size}` : ''}${item.colour ? ` · ${item.colour}` : ''}</span>
                <span>${INR(item.unitPrice)} × ${item.qty}</span>
              </div>`).join('')}
            <div class="acct-item-row" style="font-weight:500;border-top:1px solid var(--border);margin-top:8px;padding-top:8px">
              <span>Total</span><span>${INR(total)}</span>
            </div>
            ${o.shipments?.some((s) => s.trackingId) ? `
              <p style="font-size:12px;color:var(--gray);margin-top:8px">
                Tracking: <strong>${o.shipments.find((s) => s.trackingId)?.trackingId}</strong>
                (${o.shipments.find((s) => s.trackingId)?.courier || ''})
              </p>` : ''}
            ${getOrderActions(o)}
          </div>
        </div>`;
    }).join('');

  } catch {
    container.innerHTML = '<p style="color:#c00">Could not load orders. Please try again.</p>';
  }
}

window.toggleOrder = function(id) {
  const el = document.getElementById(`order-items-${id}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

document.getElementById('tab-orders').addEventListener('click', loadOrders);

/* ══════════════════════════════════════════
   ADDRESSES — FIX 2: Edit button + dynamic form
══════════════════════════════════════════ */
let savedAddresses = [];

async function loadAddresses() {
  const container = document.getElementById('addresses-list');
  container.innerHTML = '<p style="color:var(--gray)">Loading…</p>';
  try {
    const res = await fetch(`${API_BASE}/auth/addresses`, { headers: authHeader() });
    const data = await res.json();
    savedAddresses = data.data || [];
    window._userAddresses = savedAddresses;
    renderAddresses();
  } catch {
    container.innerHTML = '<p style="color:#c00">Could not load addresses.</p>';
  }
}

function renderAddresses() {
  const container = document.getElementById('addresses-list');
  if (!savedAddresses.length) {
    container.innerHTML = '<p style="color:var(--gray)">No saved addresses yet.</p>';
    return;
  }
  container.innerHTML = savedAddresses.map((a, i) => `
    <div style="background:#fff;border:0.5px solid #E8E5E0;border-radius:6px;
                padding:18px 20px;position:relative;margin-bottom:10px">
      <button onclick="deleteAddress('${a._id}')"
              style="position:absolute;top:14px;right:14px;background:none;border:none;
                     font-size:18px;cursor:pointer;color:#aaa"
              title="Remove">&#215;</button>
      <div style="font-size:14px;font-weight:500;margin-bottom:4px">${a.name || ''}</div>
      <div style="font-size:13px;color:#555;line-height:1.6">
        ${[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}
        ${a.phone ? `<br>${a.phone}` : ''}
      </div>
      <button onclick="editAddress(${i})"
              style="margin-top:12px;padding:6px 16px;background:transparent;
                     border:0.5px solid #E8E5E0;font-size:11px;letter-spacing:0.08em;
                     cursor:pointer;border-radius:3px;color:#555">
        EDIT
      </button>
    </div>`).join('');
}

window.deleteAddress = async function(id) {
  if (!confirm('Remove this address?')) return;
  try {
    const res = await fetch(`${API_BASE}/auth/addresses/${id}`, {
      method: 'DELETE', headers: authHeader()
    });
    if (!res.ok) throw new Error();
    savedAddresses = savedAddresses.filter((a) => a._id !== id);
    window._userAddresses = savedAddresses;
    renderAddresses();
  } catch {
    alert('Could not remove address. Please try again.');
  }
};

window.editAddress = function(index) {
  const addr = (window._userAddresses || savedAddresses)[index];
  if (!addr) return;
  showAddressForm(addr, index);
};

function showAddressForm(existing = null, editIndex = null) {
  const isEdit   = existing !== null;
  const formArea = document.getElementById('address-form-area');
  if (!formArea) return;

  formArea.innerHTML = `
    <div style="background:#F8F6F3;border-radius:8px;padding:24px;margin-top:16px">
      <h4 style="font-size:13px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:20px">
        ${isEdit ? 'Edit Address' : 'New Address'}
      </h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#888;display:block;margin-bottom:5px">Full Name *</label>
          <input id="addr-name" value="${existing?.name || ''}" placeholder="Name on delivery"
                 style="width:100%;padding:9px 12px;border:0.5px solid #E8E5E0;border-radius:4px;font-size:13px;outline:none;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#888;display:block;margin-bottom:5px">Phone</label>
          <input id="addr-phone" value="${existing?.phone || ''}" placeholder="10-digit mobile"
                 style="width:100%;padding:9px 12px;border:0.5px solid #E8E5E0;border-radius:4px;font-size:13px;outline:none;box-sizing:border-box"
                 maxlength="10" inputmode="numeric">
        </div>
        <div>
          <label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#888;display:block;margin-bottom:5px">Pincode *</label>
          <input id="addr-pincode" value="${existing?.pincode || ''}" placeholder="6-digit pincode"
                 style="width:100%;padding:9px 12px;border:0.5px solid #E8E5E0;border-radius:4px;font-size:13px;outline:none;box-sizing:border-box"
                 maxlength="6" inputmode="numeric"
                 oninput="if(this.value.length===6) window.fetchPincodeForAddr(this.value)">
        </div>
        <div></div>
        <div style="grid-column:1/-1">
          <label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#888;display:block;margin-bottom:5px">Address Line 1 *</label>
          <input id="addr-line1" value="${existing?.line1 || ''}" placeholder="House / flat / street"
                 style="width:100%;padding:9px 12px;border:0.5px solid #E8E5E0;border-radius:4px;font-size:13px;outline:none;box-sizing:border-box">
        </div>
        <div style="grid-column:1/-1">
          <label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#888;display:block;margin-bottom:5px">Address Line 2 (optional)</label>
          <input id="addr-line2" value="${existing?.line2 || ''}" placeholder="Landmark, area"
                 style="width:100%;padding:9px 12px;border:0.5px solid #E8E5E0;border-radius:4px;font-size:13px;outline:none;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#888;display:block;margin-bottom:5px">City *</label>
          <input id="addr-city" value="${existing?.city || ''}" placeholder="City"
                 style="width:100%;padding:9px 12px;border:0.5px solid #E8E5E0;border-radius:4px;font-size:13px;outline:none;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#888;display:block;margin-bottom:5px">State *</label>
          <input id="addr-state" value="${existing?.state || ''}" placeholder="State"
                 style="width:100%;padding:9px 12px;border:0.5px solid #E8E5E0;border-radius:4px;font-size:13px;outline:none;box-sizing:border-box">
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button onclick="window.saveAddressForm(${editIndex !== null ? `'${(window._userAddresses || savedAddresses)[editIndex]?._id}'` : 'null'})"
                style="padding:11px 28px;background:#C9A84C;color:#fff;border:none;cursor:pointer;
                       font-size:12px;letter-spacing:0.1em;border-radius:3px;font-family:inherit">
          ${isEdit ? 'UPDATE ADDRESS' : 'SAVE ADDRESS'}
        </button>
        <button onclick="document.getElementById('address-form-area').innerHTML=''"
                style="padding:11px 20px;background:transparent;border:0.5px solid #E8E5E0;
                       cursor:pointer;font-size:12px;letter-spacing:0.08em;border-radius:3px;font-family:inherit">
          CANCEL
        </button>
      </div>
    </div>`;

  formArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window.fetchPincodeForAddr = (val) => fetchPincodeData(val, 'addr-city', 'addr-state', null);

window.saveAddressForm = async function(editId) {
  const get = (id) => document.getElementById(id)?.value?.trim() || '';
  const addr = {
    name:    get('addr-name'),
    phone:   get('addr-phone') || undefined,
    pincode: get('addr-pincode'),
    line1:   get('addr-line1'),
    line2:   get('addr-line2') || undefined,
    city:    get('addr-city'),
    state:   get('addr-state'),
  };

  if (!addr.name || !addr.pincode || !addr.line1 || !addr.city || !addr.state) {
    alert('Please fill all required fields');
    return;
  }

  try {
    const isEdit = editId && editId !== 'null';
    const url    = isEdit ? `${API_BASE}/auth/addresses/${editId}` : `${API_BASE}/auth/addresses`;
    const method = isEdit ? 'PUT' : 'POST';

    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(addr)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to save');

    savedAddresses = data.data || savedAddresses;
    window._userAddresses = savedAddresses;
    renderAddresses();
    document.getElementById('address-form-area').innerHTML = '';
    showToast(isEdit ? 'Address updated' : 'Address saved');
  } catch (err) {
    alert(err.message);
  }
};

document.getElementById('add-address-btn').addEventListener('click', () => {
  showAddressForm();
  document.getElementById('add-address-btn').style.display = 'none';
  const formArea = document.getElementById('address-form-area');
  // Re-show button when form is cleared
  const obs = new MutationObserver(() => {
    if (!formArea.innerHTML.trim()) {
      document.getElementById('add-address-btn').style.display = '';
      obs.disconnect();
    }
  });
  obs.observe(formArea, { childList: true, subtree: true });
});

document.getElementById('tab-addresses').addEventListener('click', loadAddresses);

/* ══════════════════════════════════════════
   WISHLIST
══════════════════════════════════════════ */
function loadWishlist() {
  const container = document.getElementById('wishlist-list');
  let wishlist = [];
  try { wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]'); } catch {}

  if (!wishlist.length) {
    container.innerHTML = '<p style="color:var(--gray)">Your wishlist is empty. <a href="shop.html" style="color:var(--gold)">Browse products →</a></p>';
    return;
  }

  container.innerHTML = `<div class="acct-wishlist-grid">
    ${wishlist.map((item) => `
      <div class="acct-wish-card">
        <a href="product.html?id=${item.id}">
          <img src="${item.image || 'https://via.placeholder.com/200x260?text=SAGONA'}" alt="${item.name}" loading="lazy">
        </a>
        <div class="acct-wish-info">
          <p class="acct-wish-name"><a href="product.html?id=${item.id}" style="color:inherit;text-decoration:none">${item.name}</a></p>
          <p class="acct-wish-price">${INR(item.price)}</p>
          <div style="display:flex;gap:8px;margin-top:8px">
            <a href="product.html?id=${item.id}" class="btn gold" style="flex:1;text-align:center;font-size:12px;padding:8px">View</a>
            <button onclick="removeWishlistItem('${item.id}')" class="btn ghost" style="font-size:12px;padding:8px">Remove</button>
          </div>
        </div>
      </div>`).join('')}
  </div>`;
}

window.removeWishlistItem = function(id) {
  let wishlist = [];
  try { wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]'); } catch {}
  wishlist = wishlist.filter((i) => i.id !== id);
  localStorage.setItem('wishlist', JSON.stringify(wishlist));
  loadWishlist();
};

document.getElementById('tab-wishlist').addEventListener('click', loadWishlist);

/* ══════════════════════════════════════════
   LOYALTY
══════════════════════════════════════════ */
function renderLoyalty() {
  const pts = user?.loyaltyPoints ?? 0;
  document.getElementById('loyalty-pts').textContent   = pts;
  document.getElementById('loyalty-value').textContent = INR(Math.floor(pts / 100) * 10);
}

document.getElementById('tab-loyalty').addEventListener('click', renderLoyalty);

/* ══════════════════════════════════════════
   SIGN OUT
══════════════════════════════════════════ */
document.getElementById('signout-btn').addEventListener('click', () => {
  clearAuth();
  location.href = 'index.html';
});
