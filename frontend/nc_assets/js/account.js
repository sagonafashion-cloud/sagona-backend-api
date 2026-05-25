import { API_BASE } from './config.js';
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

/* ── auth header ── */
const authHeader = () => ({ Authorization: `Bearer ${token}` });

/* ── navigation ── */
const sections = ['profile', 'orders', 'addresses', 'wishlist', 'loyalty'];

function activateTab(id) {
  sections.forEach((s) => {
    document.getElementById(`tab-${s}`)?.classList.toggle('acct-tab-active', s === id);
    document.getElementById(`sec-${s}`)?.style && (document.getElementById(`sec-${s}`).style.display = s === id ? 'block' : 'none');
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
  document.getElementById('prof-name').textContent  = user.name  || '—';
  document.getElementById('prof-email').textContent = user.email || user.phone || '—';
  document.getElementById('prof-points').textContent = user.loyaltyPoints ?? 0;
}

renderProfile();

// Refresh from API
fetch(`${API_BASE}/auth/me`, { headers: authHeader() })
  .then((r) => r.json())
  .then((d) => {
    if (d.user) { user = d.user; saveUser(user); renderProfile(); }
  })
  .catch(() => {});

// Edit form toggle
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
  const btn  = document.getElementById('prof-save-btn');
  const name = document.getElementById('edit-name').value.trim();
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
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
});

/* ══════════════════════════════════════════
   ORDERS
══════════════════════════════════════════ */
async function loadOrders() {
  const container = document.getElementById('orders-list');
  container.innerHTML = '<p style="color:var(--gray)">Loading orders…</p>';

  try {
    const res  = await fetch(`${API_BASE}/orders/my`, { headers: authHeader() });
    const data = await res.json();
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
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    container.innerHTML = '<p style="color:#c00">Could not load orders. Please try again.</p>';
  }
}

window.toggleOrder = function(id) {
  const el = document.getElementById(`order-items-${id}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

document.getElementById('tab-orders').addEventListener('click', loadOrders);

/* ══════════════════════════════════════════
   ADDRESSES
══════════════════════════════════════════ */
let savedAddresses = [];

async function loadAddresses() {
  const container = document.getElementById('addresses-list');
  container.innerHTML = '<p style="color:var(--gray)">Loading…</p>';

  try {
    const res  = await fetch(`${API_BASE}/auth/addresses`, { headers: authHeader() });
    const data = await res.json();
    savedAddresses = data.data || [];
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
    <div class="acct-address-card">
      <div style="flex:1">
        <p style="font-weight:500">${a.name || ''}</p>
        <p style="font-size:13px;color:var(--gray);margin-top:4px">
          ${[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}
          ${a.phone ? `<br>${a.phone}` : ''}
        </p>
      </div>
      <button onclick="deleteAddress('${a._id}')" class="acct-del-btn" title="Remove address">✕</button>
    </div>`).join('');
}

window.deleteAddress = async function(id) {
  if (!confirm('Remove this address?')) return;
  try {
    const res = await fetch(`${API_BASE}/auth/addresses/${id}`, {
      method: 'DELETE',
      headers: authHeader()
    });
    if (!res.ok) throw new Error();
    savedAddresses = savedAddresses.filter((a) => a._id !== id);
    renderAddresses();
  } catch {
    alert('Could not remove address. Please try again.');
  }
};

// Add new address form
document.getElementById('add-address-btn').addEventListener('click', () => {
  document.getElementById('add-address-form').style.display = 'block';
  document.getElementById('add-address-btn').style.display  = 'none';
});

document.getElementById('addr-cancel-btn').addEventListener('click', () => {
  document.getElementById('add-address-form').style.display = 'none';
  document.getElementById('add-address-btn').style.display  = 'block';
  document.getElementById('new-addr-form').reset();
});

document.getElementById('new-addr-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('addr-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';

  const get = (id) => document.getElementById(id)?.value?.trim() || '';
  const payload = {
    name:    get('addr-name'),
    line1:   get('addr-line1'),
    line2:   get('addr-line2') || undefined,
    city:    get('addr-city'),
    state:   get('addr-state'),
    pincode: get('addr-pincode'),
    phone:   get('addr-phone') || undefined,
  };

  try {
    const res  = await fetch(`${API_BASE}/auth/addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to save');
    savedAddresses = data.data || savedAddresses;
    renderAddresses();
    document.getElementById('add-address-form').style.display = 'none';
    document.getElementById('add-address-btn').style.display  = 'block';
    document.getElementById('new-addr-form').reset();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Save Address';
  }
});

// Pincode autofill in address form
document.getElementById('addr-pincode')?.addEventListener('input', async function() {
  if (this.value.length !== 6 || !/^\d{6}$/.test(this.value)) return;
  try {
    const res  = await fetch(`${API_BASE}/delivery/pincode/${this.value}`);
    const data = await res.json();
    if (data.success && data.data) {
      const cityEl  = document.getElementById('addr-city');
      const stateEl = document.getElementById('addr-state');
      if (cityEl  && !cityEl.value)  cityEl.value  = data.data.city;
      if (stateEl && !stateEl.value) stateEl.value = data.data.state;
    }
  } catch {}
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
  document.getElementById('loyalty-pts').textContent = pts;
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
