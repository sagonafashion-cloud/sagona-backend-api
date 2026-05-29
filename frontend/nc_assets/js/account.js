import { API_BASE, fetchPincodeData } from './config.js';
import { getToken, getUser, saveUser, clearAuth } from './storage.js';

const token = getToken();
if (!token) {
  location.href = 'login.html?next=account.html';
}

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const STATUS_COLOR = {
  placed:           { bg: '#dbeafe', text: '#1e40af' },
  confirmed:        { bg: '#dcfce7', text: '#15803d' },
  packed:           { bg: '#ede9fe', text: '#6d28d9' },
  shipped:          { bg: '#fef3c7', text: '#b45309' },
  delivered:        { bg: '#dcfce7', text: '#15803d' },
  return_requested: { bg: '#fef3c7', text: '#92400e' },
  returned:         { bg: '#f3f4f6', text: '#4b5563' },
  cancelled:        { bg: '#fee2e2', text: '#b91c1c' },
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
      <button onclick="window.requestReturn('${order._id}','return')"
              style="padding:8px 18px;background:transparent;border:0.5px solid #555;color:#555;
                     cursor:pointer;font-size:11px;letter-spacing:0.08em;border-radius:3px">
        RETURN
      </button>
      <button onclick="window.requestReturn('${order._id}','replace')"
              style="padding:8px 18px;background:#0A0A0A;border:0.5px solid #0A0A0A;color:#fff;
                     cursor:pointer;font-size:11px;letter-spacing:0.08em;border-radius:3px">
        REPLACE
      </button>`;
  }

  if (status === 'delivered' && !inWindow) {
    html += `<span style="font-size:11px;color:#999">Return window closed (7 days)</span>`;
  }

  if (status === 'delivered') {
    const fbKey = `sz_fb_${order._id}`;
    if (!localStorage.getItem(fbKey)) {
      const firstItem = order.items?.[0];
      html += `
        <button onclick="window.openFitFeedback('${order._id}','${firstItem?.productId || ''}','${firstItem?.size || ''}')"
                style="padding:8px 18px;background:#EAF3DE;border:0.5px solid #1D9E75;color:#1D9E75;
                       cursor:pointer;font-size:11px;letter-spacing:0.08em;border-radius:3px">
          &#10024; HOW DID IT FIT?
        </button>`;
    } else {
      html += `<span style="font-size:11px;color:#1D9E75">&#10003; Fit feedback given</span>`;
    }
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

window.openFitFeedback = function(orderId, productId, chosenSize) {
  document.getElementById('fit-feedback-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'fit-feedback-modal';
  modal.style.cssText = [
    'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;',
    'display:flex;align-items:center;justify-content:center;padding:16px'
  ].join('');

  const options = [
    { value: 'perfect',        emoji: '&#128076;', label: 'Perfect fit!' },
    { value: 'slightly_tight', emoji: '&#128528;', label: 'Slightly tight' },
    { value: 'too_tight',      emoji: '&#128530;', label: 'Too tight — returning' },
    { value: 'slightly_loose', emoji: '&#128522;', label: 'Slightly loose' },
    { value: 'too_loose',      emoji: '&#128514;', label: 'Too loose — returning' }
  ];

  modal.innerHTML = `
    <div style="background:#fff;width:100%;max-width:400px;border-radius:16px;
                padding:28px 24px;box-shadow:0 20px 60px rgba(0,0,0,0.2)">
      <h3 style="font-family:'Playfair Display',Georgia,serif;font-size:20px;
                 font-weight:500;margin-bottom:6px;color:#0A0A0A">
        How did it fit?
      </h3>
      <p style="font-size:13px;color:#888;margin-bottom:20px;line-height:1.5">
        Your feedback helps us recommend sizes better for other parents.
      </p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
        ${options.map(opt => `
          <button onclick="window.submitFitFeedbackForm('${orderId}','${productId}','${chosenSize}','${opt.value}')"
                  style="padding:12px 16px;border:0.5px solid #E8E5E0;border-radius:8px;
                         background:#fff;cursor:pointer;text-align:left;font-size:13px;
                         font-family:inherit;display:flex;align-items:center;gap:12px"
                  onmouseover="this.style.background='#F8F6F3';this.style.borderColor='#C9A84C'"
                  onmouseout="this.style.background='#fff';this.style.borderColor='#E8E5E0'">
            <span style="font-size:22px">${opt.emoji}</span>
            <span style="font-weight:500;color:#0A0A0A">${opt.label}</span>
          </button>
        `).join('')}
      </div>
      <button onclick="document.getElementById('fit-feedback-modal').remove()"
              style="width:100%;padding:10px;border:0.5px solid #E8E5E0;border-radius:6px;
                     background:transparent;cursor:pointer;font-size:12px;color:#888;
                     font-family:inherit;letter-spacing:0.06em">
        SKIP
      </button>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};

window.submitFitFeedbackForm = async function(orderId, productId, chosenSize, fitFeedback) {
  try {
    const res  = await fetch(`${API_BASE}/sizing/feedback`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body:    JSON.stringify({ productId, orderId, chosenSize, fitFeedback })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem(`sz_fb_${orderId}`, '1');
      document.getElementById('fit-feedback-modal')?.remove();
      showToast(data.message || 'Thank you for your feedback!');
      loadOrders();
    } else {
      alert(data.message || 'Failed to submit feedback');
    }
  } catch (err) {
    alert('Failed: ' + err.message);
  }
};

window.requestReturn = async function(orderId, type) {
  if (type === 'return') {
    const reason = prompt('Please tell us why you want to return this item:');
    if (!reason) return;
    await submitReturnRequest(orderId, 'return', reason, null, null);
  } else if (type === 'replace') {
    showReplacementSelector(orderId);
  }
};

async function showReplacementSelector(orderId) {
  const modal = document.createElement('div');
  modal.id = 'replacement-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:8px;width:100%;max-width:600px;max-height:85vh;overflow-y:auto;padding:28px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h3 style="font-family:'Playfair Display',serif;font-size:20px;font-weight:500">Select Replacement Product</h3>
        <button onclick="document.getElementById('replacement-modal').remove()"
                style="background:none;border:none;font-size:22px;cursor:pointer;color:#888">&#215;</button>
      </div>
      <p style="font-size:13px;color:#888;margin-bottom:20px">Choose the product you would like as a replacement. Our team will confirm availability.</p>
      <div style="margin-bottom:16px">
        <input type="text" id="replacement-search" placeholder="Search products…"
               oninput="window.searchReplacementProducts(this.value)"
               style="width:100%;padding:10px 14px;border:0.5px solid #E8E5E0;border-radius:4px;font-size:13px;outline:none;box-sizing:border-box">
      </div>
      <div style="margin-bottom:16px">
        <label style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;display:block;margin-bottom:6px">Reason for replacement *</label>
        <textarea id="replacement-reason" rows="2" placeholder="e.g. Wrong size, defective product…"
                  style="width:100%;padding:10px 14px;border:0.5px solid #E8E5E0;border-radius:4px;font-size:13px;outline:none;resize:none;font-family:inherit;box-sizing:border-box"></textarea>
      </div>
      <div id="replacement-products" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px">
        <div style="grid-column:1/-1;text-align:center;padding:20px;color:#888;font-size:13px">Loading products…</div>
      </div>
      <div id="replacement-selected" style="display:none;background:#EAF3DE;border-radius:6px;padding:12px 16px;margin-bottom:16px">
        <div style="font-size:12px;color:#1D9E75;font-weight:500;margin-bottom:4px">SELECTED FOR REPLACEMENT</div>
        <div id="replacement-selected-name" style="font-size:14px;font-weight:500"></div>
      </div>
      <div style="display:flex;gap:10px">
        <button onclick="window.submitReplacement('${orderId}')"
                style="flex:1;padding:12px;background:#C9A84C;color:#fff;border:none;cursor:pointer;font-size:12px;letter-spacing:0.1em;border-radius:3px;font-family:inherit">
          SUBMIT REPLACEMENT REQUEST
        </button>
        <button onclick="document.getElementById('replacement-modal').remove()"
                style="padding:12px 20px;background:transparent;border:0.5px solid #E8E5E0;cursor:pointer;font-size:12px;border-radius:3px;font-family:inherit">
          CANCEL
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  await loadReplacementProducts('');
}

let _selectedReplacement = null;

async function loadReplacementProducts(query) {
  const grid = document.getElementById('replacement-products');
  if (!grid) return;
  try {
    const params = new URLSearchParams({ status: 'active', limit: '12' });
    if (query) params.set('search', query);
    const res  = await fetch(`${API_BASE}/products?${params}`);
    const json = await res.json();
    const products = json.data || [];

    if (!products.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#888">No products found</div>';
      return;
    }

    grid.innerHTML = products.map((p) => {
      const img = p.images?.[0] || p.image || '';
      const safeName = p.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const safeImg  = img.replace(/'/g, '%27');
      return `
        <div onclick="window.selectReplacement('${p._id}','${safeName}','${safeImg}')"
             id="rp-${p._id}"
             style="border:0.5px solid #E8E5E0;border-radius:6px;overflow:hidden;cursor:pointer;transition:border 0.15s,background 0.15s">
          <div style="aspect-ratio:1;overflow:hidden;background:#F8F6F3">
            ${img ? `<img src="${img}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover">` : '<div style="width:100%;height:100%;background:#F0EDE8"></div>'}
          </div>
          <div style="padding:8px">
            <div style="font-size:12px;font-weight:500;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
            <div style="font-size:12px;color:#555">&#8377;${Number(p.price).toLocaleString('en-IN')}</div>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    grid.innerHTML = `<div style="grid-column:1/-1;color:red;padding:16px">Failed to load: ${err.message}</div>`;
  }
}

let _replacementSearchTimer = null;
window.searchReplacementProducts = (query) => {
  clearTimeout(_replacementSearchTimer);
  _replacementSearchTimer = setTimeout(() => loadReplacementProducts(query), 400);
};

window.selectReplacement = (id, name, img) => {
  _selectedReplacement = { id, name, img };
  document.querySelectorAll('[id^="rp-"]').forEach((el) => {
    el.style.border = '0.5px solid #E8E5E0';
    el.style.background = '#fff';
  });
  const card = document.getElementById(`rp-${id}`);
  if (card) { card.style.border = '2px solid #C9A84C'; card.style.background = '#FAEEDA'; }
  const selDiv  = document.getElementById('replacement-selected');
  const selName = document.getElementById('replacement-selected-name');
  if (selDiv)  selDiv.style.display = 'block';
  if (selName) selName.textContent  = name;
};

window.submitReplacement = async (orderId) => {
  const reason = document.getElementById('replacement-reason')?.value.trim();
  if (!reason)               { alert('Please enter a reason for replacement'); return; }
  if (!_selectedReplacement) { alert('Please select a replacement product'); return; }

  await submitReturnRequest(
    orderId, 'replace', reason,
    _selectedReplacement.id,
    _selectedReplacement.name
  );

  document.getElementById('replacement-modal')?.remove();
  _selectedReplacement = null;
};

async function submitReturnRequest(orderId, type, reason, replacementProductId, replacementProductName) {
  try {
    const res = await fetch(`${API_BASE}/orders/${orderId}/return-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({
        returnType: type,
        reason,
        replacementProductId:   replacementProductId   || '',
        replacementProductName: replacementProductName || ''
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Request submitted successfully');
      loadOrders();
    } else {
      alert(data.message || 'Request failed');
    }
  } catch (err) {
    alert('Failed to submit: ' + err.message);
  }
}

const PROGRESS_STEPS = [
  { key: 'placed',           label: 'Placed' },
  { key: 'confirmed',        label: 'Confirmed' },
  { key: 'packed',           label: 'Packed' },
  { key: 'shipped',          label: 'Shipped' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered',        label: 'Delivered' }
];

function buildProgressBar(status) {
  const terminal  = ['cancelled', 'return_requested', 'returned'];
  if (terminal.includes(status)) return '';

  const activeIdx = PROGRESS_STEPS.findIndex((s) => s.key === status);
  const pct       = activeIdx < 0 ? 0 : Math.round((activeIdx / (PROGRESS_STEPS.length - 1)) * 100);

  const circles = PROGRESS_STEPS.map((step, i) => {
    const done    = i <= activeIdx;
    const bg      = done ? '#C9A84C' : '#E8E5E0';
    const textCol = done ? '#fff' : '#999';
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
        <div style="width:24px;height:24px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:11px;color:${textCol};font-weight:600;position:relative;z-index:1">
          ${done ? '✓' : ''}
        </div>
        <span style="font-size:10px;color:${done ? '#C9A84C' : '#aaa'};text-align:center;line-height:1.3">${step.label}</span>
      </div>`;
  }).join('');

  return `
    <div style="padding:16px 0 4px">
      <div style="position:relative;display:flex;align-items:flex-start">
        <div style="position:absolute;top:12px;left:0;right:0;height:2px;background:#E8E5E0;z-index:0">
          <div style="height:100%;width:${pct}%;background:#C9A84C;transition:width 0.4s"></div>
        </div>
        ${circles}
      </div>
    </div>`;
}

function buildTimeline(timeline, currentStatus) {
  if (!timeline || !timeline.length) {
    if (!currentStatus) return '';
    return `
      <div style="display:flex;gap:12px;align-items:flex-start;padding:8px 0">
        <div style="width:10px;height:10px;border-radius:50%;background:#C9A84C;margin-top:3px;flex-shrink:0"></div>
        <div>
          <div style="font-size:13px;font-weight:500;text-transform:capitalize">${currentStatus.replace(/_/g,' ')}</div>
        </div>
      </div>`;
  }

  const sorted = [...timeline].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return sorted.map((entry, i) => {
    const isLatest  = i === 0;
    const dotColor  = isLatest ? '#C9A84C' : '#D4CFC9';
    const dateStr   = entry.timestamp
      ? new Date(entry.timestamp).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
      : '';
    return `
      <div style="display:flex;gap:12px;align-items:flex-start;padding:8px 0;border-bottom:0.5px solid #F3F0EC">
        <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
          <div style="width:10px;height:10px;border-radius:50%;background:${dotColor};margin-top:3px"></div>
        </div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:${isLatest ? '600' : '400'};color:${isLatest ? '#0A0A0A' : '#555'}">${entry.label || entry.status || '—'}</div>
          ${entry.description ? `<div style="font-size:12px;color:#777;margin-top:2px">${entry.description}</div>` : ''}
          ${entry.location ? `<div style="font-size:11px;color:#aaa;margin-top:2px">📍 ${entry.location}</div>` : ''}
          ${dateStr ? `<div style="font-size:11px;color:#aaa;margin-top:2px">${dateStr}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function renderOrderCard(o) {
  const itemCount = (o.items || []).reduce((s, i) => s + (i.qty || 1), 0);
  const total     = o.billing?.grandTotal ?? 0;
  const shipment  = o.shipments?.find((s) => s.trackingId);
  const estDel    = o.estimatedDelivery && !['delivered','cancelled','returned'].includes(o.status)
    ? new Date(o.estimatedDelivery).toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' })
    : null;

  return `
    <div class="acct-order-card" data-id="${o._id}">
      <div class="acct-order-header" onclick="toggleOrderTracking('${o._id}')"
           style="display:flex;justify-content:space-between;align-items:center;cursor:pointer">
        <div>
          <p class="acct-order-num">${o.orderNumber || '—'}</p>
          <p class="acct-order-meta">${fmtDate(o.createdAt)} · ${itemCount} item${itemCount !== 1 ? 's' : ''}</p>
          ${estDel ? `<p style="font-size:11px;color:#1D9E75;margin-top:2px">Est. delivery: ${estDel}</p>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="text-align:right">
            ${statusBadge(o.status)}
            <p style="margin-top:6px;font-weight:500;font-size:15px">${INR(total)}</p>
          </div>
          <span id="chevron-${o._id}" style="font-size:18px;color:#aaa;transition:transform 0.2s">›</span>
        </div>
      </div>

      <div id="tracking-${o._id}" style="display:none;padding:4px 0 8px">
        ${buildProgressBar(o.status)}

        ${shipment ? `
          <div style="background:#F8F6F3;border-radius:6px;padding:12px 14px;margin:12px 0;font-size:13px">
            <div style="font-weight:500">${shipment.courier || 'Courier'}</div>
            <div style="color:#555;margin-top:2px">AWB: <strong>${shipment.trackingId}</strong></div>
            ${shipment.trackingUrl ? `
              <a href="${shipment.trackingUrl}" target="_blank" rel="noopener"
                 style="display:inline-block;margin-top:10px;padding:7px 16px;background:#0A0A0A;color:#fff;
                        text-decoration:none;font-size:11px;letter-spacing:0.08em;border-radius:3px">
                TRACK SHIPMENT
              </a>` : ''}
          </div>` : ''}

        <div style="margin:12px 0">
          <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;color:#aaa;margin-bottom:8px">ORDER UPDATES</div>
          ${buildTimeline(o.timeline, o.status)}
        </div>

        <div style="border-top:0.5px solid var(--border);padding-top:12px;margin-top:4px">
          ${(o.items || []).map((item) => `
            <div class="acct-item-row">
              <span>${item.name}${item.size ? ` · ${item.size}` : ''}${item.colour ? ` · ${item.colour}` : ''}</span>
              <span>${INR(item.unitPrice)} × ${item.qty}</span>
            </div>`).join('')}
          <div class="acct-item-row" style="font-weight:500;border-top:1px solid var(--border);margin-top:8px;padding-top:8px">
            <span>Total</span><span>${INR(total)}</span>
          </div>
        </div>

        ${getOrderActions(o)}
      </div>
    </div>`;
}

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

    container.innerHTML = orders.map((o) => renderOrderCard(o)).join('');

  } catch {
    container.innerHTML = '<p style="color:#c00">Could not load orders. Please try again.</p>';
  }
}

window.toggleOrderTracking = function(id) {
  const body    = document.getElementById(`tracking-${id}`);
  const chevron = document.getElementById(`chevron-${id}`);
  if (!body) return;
  const open = body.style.display === 'none';
  body.style.display    = open ? 'block' : 'none';
  if (chevron) chevron.style.transform = open ? 'rotate(90deg)' : 'none';
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
