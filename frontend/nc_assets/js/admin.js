import { API_BASE, escapeHtml } from './config.js';

// Tracks Cloudinary URLs uploaded in the current product modal
let _uploadedUrls = [];

/* ══════════════════════════════════════
   UTILITIES
══════════════════════════════════════ */
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' }) : '—';

function toast(msg, type = '') {
  const c  = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast${type ? ' ' + type : ''}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

/* ── admin fetch (uses admin_token) ── */
async function api(path, opts = {}) {
  const token = sessionStorage.getItem('admin_token');
  const isFormData = opts.body instanceof FormData;

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(opts.headers || {})
    },
    body: opts.body || undefined
  });

  const ct   = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data;
}

/* ══════════════════════════════════════
   AUTH
══════════════════════════════════════ */
let _tempToken = null;
let _adminUser = null;

async function checkAuth() {
  const token = sessionStorage.getItem('admin_token');
  if (!token) return false;
  try {
    const data = await api('/admin/auth/me');
    _adminUser = data.data;
    return true;
  } catch {
    sessionStorage.removeItem('admin_token');
    return false;
  }
}

/* ── login step 1 ── */
document.getElementById('login-btn').addEventListener('click', async () => {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';

  if (!email || !password) { errEl.textContent = 'Email and password required.'; return; }

  try {
    document.getElementById('login-btn').disabled = true;
    const data = await api('/admin/auth/login', {
      method: 'POST',
      body:   JSON.stringify({ email, password })
    });

    if (data.requiresTwoFactor) {
      _tempToken = data.tempToken;
      document.getElementById('login-step1').style.display = 'none';
      document.getElementById('login-step2').style.display = 'block';
      document.getElementById('totp-code').focus();
    } else {
      sessionStorage.setItem('admin_token', data.token);
      _adminUser = data.admin;
      startApp();
    }
  } catch (err) {
    errEl.textContent = err.message || 'Login failed.';
  } finally {
    document.getElementById('login-btn').disabled = false;
  }
});

/* ── login step 2 (2FA) ── */
document.getElementById('totp-btn').addEventListener('click', async () => {
  const code  = document.getElementById('totp-code').value.trim();
  const errEl = document.getElementById('totp-error');
  errEl.textContent = '';

  if (!code) { errEl.textContent = 'Enter the 6-digit code.'; return; }

  try {
    document.getElementById('totp-btn').disabled = true;
    const data = await api('/admin/auth/verify-2fa', {
      method: 'POST',
      body:   JSON.stringify({ tempToken: _tempToken, code })
    });
    sessionStorage.setItem('admin_token', data.token);
    _adminUser = data.admin;
    startApp();
  } catch (err) {
    errEl.textContent = err.message || 'Invalid code.';
    document.getElementById('totp-btn').disabled = false;
  }
});

// Enter key triggers buttons
document.getElementById('login-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('login-btn').click();
});
document.getElementById('totp-code')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('totp-btn').click();
});

/* ── logout ── */
async function doLogout() {
  stopInactivityWatch();
  try { await api('/admin/auth/logout', { method: 'POST' }); } catch {}
  sessionStorage.removeItem('admin_token');
  location.reload();
}

document.getElementById('logout-btn').addEventListener('click', doLogout);

/* ── inactivity auto-logout ── */
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const INACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
let _inactivityTimer = null;

function resetInactivityTimer() {
  clearTimeout(_inactivityTimer);
  _inactivityTimer = setTimeout(() => {
    toast('Session expired due to inactivity', 'error');
    doLogout();
  }, INACTIVITY_LIMIT_MS);
}

function startInactivityWatch() {
  INACTIVITY_EVENTS.forEach((evt) => document.addEventListener(evt, resetInactivityTimer, { passive: true }));
  resetInactivityTimer();
}

function stopInactivityWatch() {
  clearTimeout(_inactivityTimer);
  INACTIVITY_EVENTS.forEach((evt) => document.removeEventListener(evt, resetInactivityTimer));
}

/* ══════════════════════════════════════
   APP BOOT
══════════════════════════════════════ */
async function startApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-app').style.display = 'grid';
  document.getElementById('topbar-user').textContent =
    `${_adminUser?.name || ''} · ${_adminUser?.role || ''}`;
  initNav();
  showSection('dashboard');
  startInactivityWatch();
}

/* ══════════════════════════════════════
   NAVIGATION
══════════════════════════════════════ */
const SECTIONS = ['dashboard','orders','returns','products','stores','homepage','analytics','gst','users'];

function initNav() {
  document.getElementById('admin-nav').addEventListener('click', (e) => {
    const item = e.target.closest('[data-section]');
    if (!item) return;
    document.querySelectorAll('.admin-nav-item').forEach((el) => el.classList.remove('active'));
    item.classList.add('active');
    showSection(item.dataset.section);
  });
}

function showSection(name) {
  SECTIONS.forEach((s) => {
    document.getElementById(`section-${s}`).style.display = s === name ? 'block' : 'none';
  });
  document.getElementById('topbar-section').textContent = name.charAt(0).toUpperCase() + name.slice(1);

  const loaders = {
    dashboard: loadDashboard,
    orders:    loadOrders,
    returns:   loadReturns,
    products:  loadProducts,
    stores:    loadStores,
    homepage:  loadHomepageManager,
    analytics: loadAnalytics,
    gst:       () => {},
    users:     loadAdminUsers
  };
  loaders[name]?.();
}

/* ══════════════════════════════════════
   MODAL
══════════════════════════════════════ */
function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').style.display = 'flex';
}
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('modal-body').innerHTML = '';
}
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

/* ══════════════════════════════════════
   DASHBOARD
══════════════════════════════════════ */
let _revChart = null, _statusChart = null;

async function loadDashboard() {
  try {
    const [revData, statusData, orders, products] = await Promise.allSettled([
      api('/admin/analytics/revenue?period=daily&days=30'),
      api('/admin/analytics/orders'),
      api('/admin/orders?limit=8'),
      api('/products?limit=1')
    ]);

    // Stats
    const rev   = revData.value?.data || [];
    const totalRev = rev.reduce((s, d) => s + (d.revenue || 0), 0);
    const totalOrd = revData.value?.totalOrders || orders.value?.total || 0;
    document.getElementById('stat-revenue').textContent  = INR(totalRev);
    document.getElementById('stat-orders').textContent   = totalOrd;
    document.getElementById('stat-aov').textContent      = totalOrd ? INR(Math.round(totalRev / totalOrd)) : '—';
    document.getElementById('stat-products').textContent = products.value?.total || '—';

    // Revenue chart
    const labels  = rev.map((d) => d._id || d.date || '');
    const revenue = rev.map((d) => d.revenue || 0);
    renderLineChart('chart-revenue', labels, revenue, _revChart, (c) => _revChart = c);

    // Status doughnut
    const statusItems = statusData.value?.data?.byStatus || [];
    renderDoughnut('chart-status', statusItems, _statusChart, (c) => _statusChart = c);

    // Recent orders
    const recentOrders = orders.value?.data || [];
    renderOrderRows('dash-orders-body', recentOrders, false);

    // Returns badge
    try {
      const returnsRes = await api('/admin/orders/returns');
      const pendingCount = returnsRes.data?.length || 0;
      const badge = document.getElementById('returns-badge');
      if (badge) {
        badge.textContent = pendingCount;
        badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
      }
    } catch {}

  } catch (err) {
    console.error('loadDashboard:', err);
  }
}

function renderLineChart(canvasId, labels, data, existing, setter) {
  if (existing) existing.destroy();
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  setter(new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (₹)',
        data,
        borderColor: '#C9A84C',
        backgroundColor: 'rgba(201,168,76,.1)',
        fill: true,
        tension: .4,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: '#E8E5E0' }, ticks: { font: { size: 10 }, callback: (v) => `₹${(v/1000).toFixed(0)}k` } }
      }
    }
  }));
}

function renderDoughnut(canvasId, items, existing, setter) {
  if (existing) existing.destroy();
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  const COLORS = { placed:'#94a3b8', confirmed:'#60a5fa', packed:'#fbbf24', shipped:'#a78bfa', delivered:'#34d399', cancelled:'#f87171', returned:'#9ca3af' };
  const labels = items.map((i) => i._id);
  const counts = items.map((i) => i.count);
  setter(new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: counts, backgroundColor: labels.map((l) => COLORS[l] || '#ddd'), borderWidth: 1 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } } },
      cutout: '60%'
    }
  }));
}

/* ══════════════════════════════════════
   ORDERS
══════════════════════════════════════ */
let _ordersPage = 1;
const _ordersCache = {}; // orderId → order object

async function loadOrders() {
  const search = document.getElementById('order-search')?.value || '';
  const status = document.getElementById('order-status-filter')?.value || '';
  const params = new URLSearchParams({ page: _ordersPage, limit: 20 });
  if (search) params.set('search', search);
  if (status) params.set('status', status);

  try {
    const data = await api(`/admin/orders?${params}`);
    renderOrderRows('orders-body', data.data || [], true);
    const pgEl = document.getElementById('orders-pagination');
    if (pgEl) pgEl.textContent = `Page ${data.page} of ${Math.ceil((data.total || 0) / 20)} · ${data.total} orders`;
  } catch (err) {
    document.getElementById('orders-body').innerHTML =
      `<tr><td colspan="8" class="loading">Failed to load orders.</td></tr>`;
  }
}

function renderOrderRows(tbodyId, orders, showActions) {
  const tbody = document.getElementById(tbodyId);
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="${showActions ? 8 : 5}" class="loading">No orders found.</td></tr>`;
    return;
  }
  // Cache orders for modal access
  orders.forEach((o) => { _ordersCache[o._id] = o; });

  tbody.innerHTML = orders.map((o) => `
    <tr>
      <td><a href="#" style="color:var(--gold)">${o.orderNumber || o._id?.slice(-8)}</a></td>
      <td>${escapeHtml(o.customer?.name) || '—'}<br><span style="font-size:11px;color:var(--gray)">${escapeHtml(o.customer?.email)}</span></td>
      ${showActions ? `<td>${(o.items || []).length} items</td>` : ''}
      <td>${INR(o.billing?.grandTotal)}</td>
      ${showActions ? `<td style="font-size:11px">${o.payment?.method || '—'}</td>` : ''}
      <td><span class="pill pill-${o.status}">${o.status || '—'}</span></td>
      <td>${fmt(o.createdAt)}</td>
      ${showActions ? `
      <td>
        <button onclick="window.openStatusModal('${o._id}')"
                style="padding:5px 12px;background:transparent;border:0.5px solid var(--border);
                       border-radius:3px;font-size:11px;cursor:pointer;letter-spacing:0.05em">
          UPDATE
        </button>
      </td>` : ''}
    </tr>`).join('');
}

window.openStatusModal = function(orderId) {
  const order = _ordersCache[orderId];
  if (!order) return;
  openModal(buildStatusUpdateModal(order));
};

function buildStatusUpdateModal(order) {
  return `
    <h2 style="font-size:16px;font-weight:500;margin-bottom:4px">Update Order Status</h2>
    <p style="font-size:12px;color:var(--gray);margin-bottom:20px">${escapeHtml(order.orderNumber)} · ${escapeHtml(order.customer?.name)}</p>
    <div style="padding:4px">
      <div class="form-group" style="margin-bottom:14px">
        <label style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;display:block;margin-bottom:6px">New Status *</label>
        <select id="new-status" onchange="window.onStatusChange(this.value)"
                style="width:100%;padding:9px;border:0.5px solid var(--border);border-radius:4px;font-size:13px;font-family:inherit">
          <option value="">Select status…</option>
          <option value="confirmed"        ${order.status==='confirmed'?        'selected':''}>✅ Confirmed</option>
          <option value="packed"           ${order.status==='packed'?           'selected':''}>📦 Packed</option>
          <option value="shipped"          ${order.status==='shipped'?          'selected':''}>🚚 Shipped</option>
          <option value="out_for_delivery" ${order.status==='out_for_delivery'? 'selected':''}>🛵 Out for Delivery</option>
          <option value="delivered"        ${order.status==='delivered'?        'selected':''}>✅ Delivered</option>
          <option value="cancelled"        ${order.status==='cancelled'?        'selected':''}>❌ Cancelled</option>
        </select>
      </div>

      <div id="tracking-fields" style="display:none;background:#F8F6F3;border-radius:6px;padding:16px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#888;margin-bottom:12px">SHIPMENT DETAILS</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;display:block;margin-bottom:5px">Courier *</label>
            <select id="courier-name" style="width:100%;padding:9px;border:0.5px solid var(--border);border-radius:4px;font-size:13px;font-family:inherit">
              <option value="">Select courier…</option>
              <option value="Delhivery">Delhivery</option>
              <option value="Shiprocket">Shiprocket</option>
              <option value="DTDC">DTDC</option>
              <option value="Blue Dart">Blue Dart</option>
              <option value="Ekart">Ekart</option>
              <option value="Xpressbees">Xpressbees</option>
              <option value="Shadowfax">Shadowfax</option>
              <option value="Amazon Logistics">Amazon Logistics</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;display:block;margin-bottom:5px">AWB / Tracking # *</label>
            <input type="text" id="tracking-id" placeholder="e.g. 1234567890"
                   style="width:100%;padding:9px;border:0.5px solid var(--border);border-radius:4px;font-size:13px;box-sizing:border-box">
          </div>
          <div style="grid-column:1/-1">
            <label style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;display:block;margin-bottom:5px">Tracking URL (auto-generated if blank)</label>
            <input type="url" id="tracking-url" placeholder="https://courier.com/track/…"
                   style="width:100%;padding:9px;border:0.5px solid var(--border);border-radius:4px;font-size:13px;box-sizing:border-box">
          </div>
          <div>
            <label style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;display:block;margin-bottom:5px">Expected Delivery</label>
            <input type="date" id="expected-delivery"
                   style="width:100%;padding:9px;border:0.5px solid var(--border);border-radius:4px;font-size:13px">
          </div>
        </div>
      </div>

      <div id="location-field" style="display:none;margin-bottom:14px">
        <label style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;display:block;margin-bottom:5px">Current Location (optional)</label>
        <input type="text" id="status-location" placeholder="e.g. Jaipur Warehouse"
               style="width:100%;padding:9px;border:0.5px solid var(--border);border-radius:4px;font-size:13px;box-sizing:border-box">
      </div>

      <div style="margin-bottom:16px">
        <label style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;display:block;margin-bottom:5px">Note to customer (optional)</label>
        <textarea id="status-note" rows="2" placeholder="Custom message shown in tracking timeline…"
                  style="width:100%;padding:9px;border:0.5px solid var(--border);border-radius:4px;font-size:13px;resize:none;font-family:inherit;box-sizing:border-box"></textarea>
      </div>

      <button onclick="window.submitStatusUpdate('${order._id}')"
              style="width:100%;padding:12px;background:#C9A84C;color:#fff;border:none;cursor:pointer;
                     font-size:12px;letter-spacing:0.1em;border-radius:3px;font-family:inherit">
        UPDATE STATUS &amp; NOTIFY CUSTOMER
      </button>
    </div>
  `;
}

window.onStatusChange = function(status) {
  const trackingFields = document.getElementById('tracking-fields');
  const locationField  = document.getElementById('location-field');
  if (trackingFields) trackingFields.style.display = status === 'shipped' ? 'block' : 'none';
  if (locationField)  locationField.style.display  = ['shipped','out_for_delivery'].includes(status) ? 'block' : 'none';
};

window.submitStatusUpdate = async function(orderId) {
  const status = document.getElementById('new-status')?.value;
  if (!status) { toast('Please select a status', 'error'); return; }

  const trackingId  = document.getElementById('tracking-id')?.value.trim();
  const courierName = document.getElementById('courier-name')?.value;

  if (status === 'shipped' && !trackingId)  { toast('Tracking number is required when marking as shipped', 'error'); return; }
  if (status === 'shipped' && !courierName) { toast('Please select a courier', 'error'); return; }

  let trackingUrl = document.getElementById('tracking-url')?.value.trim();
  if (!trackingUrl && trackingId && courierName) {
    const urlMap = {
      'Delhivery':  `https://www.delhivery.com/track/package/${trackingId}`,
      'DTDC':       `https://www.dtdc.in/tracking/tracking_results.asp?Ttype=awb&strCnno=${trackingId}`,
      'Blue Dart':  `https://www.bluedart.com/tracking?trackFor=0&refNo=${trackingId}`,
      'Ekart':      `https://ekartlogistics.com/shipmenttrack/${trackingId}`,
      'Xpressbees': `https://www.xpressbees.com/shipment/tracking?awbNo=${trackingId}`,
      'Shadowfax':  `https://tracker.shadowfax.in/?wbn=${trackingId}`,
    };
    trackingUrl = urlMap[courierName] || '';
  }

  const body = {
    status,
    trackingId:       trackingId       || undefined,
    courier:          courierName      || undefined,
    trackingUrl:      trackingUrl      || undefined,
    location:         document.getElementById('status-location')?.value.trim()   || undefined,
    note:             document.getElementById('status-note')?.value.trim()        || undefined,
    expectedDelivery: document.getElementById('expected-delivery')?.value         || undefined
  };

  try {
    await api(`/admin/orders/${orderId}/status`, { method: 'PUT', body: JSON.stringify(body) });
    toast('Status updated — customer notified by email', 'success');
    closeModal();
    loadOrders();
  } catch (err) {
    toast('Update failed: ' + err.message, 'error');
  }
};

// Order filters
document.getElementById('order-search')?.addEventListener('input', debounce(() => { _ordersPage = 1; loadOrders(); }, 400));
document.getElementById('order-status-filter')?.addEventListener('change', () => { _ordersPage = 1; loadOrders(); });

/* ══════════════════════════════════════
   RETURNS
══════════════════════════════════════ */
async function loadReturns() {
  const list = document.getElementById('returns-list');
  list.innerHTML = '<div class="loading">Loading…</div>';

  try {
    const res = await api('/admin/orders/returns');
    const returns = res.data || [];

    // Update badge
    const badge = document.getElementById('returns-badge');
    if (badge) {
      badge.textContent = returns.length;
      badge.style.display = returns.length > 0 ? 'inline-block' : 'none';
    }

    if (!returns.length) {
      list.innerHTML = '<div class="loading">No pending return requests</div>';
      return;
    }

    list.innerHTML = `
      <div class="admin-card">
        <table class="admin-table">
          <thead>
            <tr>
              <th>ORDER #</th>
              <th>CUSTOMER</th>
              <th>TYPE</th>
              <th>REASON</th>
              <th>REPLACEMENT PRODUCT</th>
              <th>REQUESTED</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            ${returns.map((order) => {
              const rr = order.returnRequest;
              const isReplace = rr.type === 'replace';
              const date = new Date(rr.requestedAt).toLocaleDateString('en-IN');
              return `
                <tr>
                  <td style="font-weight:500;color:var(--gold)">${escapeHtml(order.orderNumber)}</td>
                  <td>
                    <div>${escapeHtml(order.customer?.name) || '—'}</div>
                    <div style="font-size:11px;color:var(--gray)">${escapeHtml(order.customer?.email)}</div>
                  </td>
                  <td>
                    <span style="padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;
                      background:${isReplace ? '#E6F1FB' : '#FCEBEB'};
                      color:${isReplace ? '#0C447C' : '#791F1F'}">
                      ${isReplace ? 'REPLACE' : 'RETURN'}
                    </span>
                  </td>
                  <td style="font-size:13px;max-width:200px">${escapeHtml(rr.reason) || '—'}</td>
                  <td style="font-size:13px">
                    ${isReplace && rr.replacementProductName
                      ? `<span style="color:var(--gold)">${escapeHtml(rr.replacementProductName)}</span>`
                      : isReplace ? '<span style="color:var(--gray)">Not selected yet</span>' : '—'
                    }
                  </td>
                  <td style="font-size:12px;color:var(--gray)">${date}</td>
                  <td>
                    <div style="display:flex;gap:6px">
                      <button onclick="window.actionReturn('${order._id}','approved')"
                              style="padding:6px 14px;background:#1D9E75;color:#fff;border:none;
                                     cursor:pointer;font-size:11px;letter-spacing:0.06em;border-radius:3px">
                        APPROVE
                      </button>
                      <button onclick="window.actionReturn('${order._id}','rejected')"
                              style="padding:6px 14px;background:transparent;color:#E24B4A;
                                     border:0.5px solid #E24B4A;cursor:pointer;font-size:11px;
                                     letter-spacing:0.06em;border-radius:3px">
                        REJECT
                      </button>
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

  } catch (err) {
    list.innerHTML = `<div style="color:red;padding:20px">Failed to load: ${err.message}</div>`;
  }
}

window.actionReturn = async function(orderId, action) {
  const note = action === 'rejected'
    ? prompt('Enter reason for rejection (optional, shown in admin notes):')
    : null;
  if (action === 'rejected' && note === null) return; // user cancelled prompt

  try {
    await api(`/admin/orders/${orderId}/return-action`, {
      method: 'PUT',
      body: JSON.stringify({ action, adminNote: note || '' })
    });
    toast(action === 'approved' ? 'Return approved successfully' : 'Return rejected', action === 'approved' ? 'success' : 'error');
    loadReturns();
  } catch (err) {
    toast('Failed: ' + err.message, 'error');
  }
};

/* ══════════════════════════════════════
   PRODUCTS
══════════════════════════════════════ */
async function loadProducts() {
  const search   = document.getElementById('product-search')?.value || '';
  const category = document.getElementById('product-category-filter')?.value || '';
  const status   = document.getElementById('product-status-filter')?.value || '';
  const params   = new URLSearchParams({ limit: 30 });
  if (search)   params.set('search', search);
  if (category) params.set('category', category);
  if (status)   params.set('status', status);

  try {
    const data = await api(`/products?${params}`);
    const products = Array.isArray(data) ? data : (data.data || []);
    renderProducts(products);
  } catch {
    document.getElementById('products-body').innerHTML =
      `<tr><td colspan="7" class="loading">Failed to load products.</td></tr>`;
  }
}

function renderProducts(products) {
  const tbody = document.getElementById('products-body');
  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading">No products found.</td></tr>`;
    return;
  }
  tbody.innerHTML = products.map((p) => {
    const img = p.images?.[0] || p.image || '';
    return `
    <tr>
      <td><img src="${img}" style="width:44px;height:44px;object-fit:cover;border-radius:var(--radius)" onerror="this.style.display='none'"></td>
      <td>${escapeHtml(p.name)}</td>
      <td style="font-size:11px;color:var(--gray)">${escapeHtml(p.sku) || '—'}</td>
      <td>${INR(p.price)}${p.mrp && p.mrp > p.price ? ` <span style="font-size:11px;color:var(--light-gray);text-decoration:line-through">${INR(p.mrp)}</span>` : ''}</td>
      <td><span style="font-size:11px;text-transform:capitalize">${escapeHtml(p.category) || '—'}</span></td>
      <td><span class="pill ${p.status === 'active' ? 'pill-delivered' : 'pill-placed'}">${escapeHtml(p.status) || 'active'}</span></td>
      <td style="white-space:nowrap">
        <button class="btn ghost" style="padding:5px 10px;font-size:10px" onclick="editProduct('${p._id}')">Edit</button>
        <button class="btn ghost" style="padding:5px 10px;font-size:10px;color:#C9A84C" onclick="window.openSizingConfig('${p._id}')">Sizing</button>
        <button class="btn ghost" style="padding:5px 10px;font-size:10px;color:#dc2626" onclick="archiveProduct('${p._id}','${encodeURIComponent(p.name)}')">Archive</button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('product-search')?.addEventListener('input', debounce(loadProducts, 400));
document.getElementById('product-category-filter')?.addEventListener('change', loadProducts);
document.getElementById('product-status-filter')?.addEventListener('change', loadProducts);

/* ── bulk upload ── */
document.getElementById('bulk-upload-btn')?.addEventListener('click', () => openBulkUpload());

/* ── add product ── */
document.getElementById('add-product-btn')?.addEventListener('click', () => {
  _uploadedUrls = []; // reset for each new product
  openModal(`
    <h2 style="font-size:18px;margin-bottom:20px">Add Product</h2>
    <div class="form-2col">
      <div><label>Name *</label><input id="mp-name" type="text" placeholder="Product name"></div>
      <div><label>SKU</label><input id="mp-sku" type="text" placeholder="SAG-001"></div>
      <div><label>Price (₹) *</label><input id="mp-price" type="number" min="0"></div>
      <div><label>MRP (₹)</label><input id="mp-mrp" type="number" min="0"></div>
      <div>
        <label>Category</label>
        <select id="mp-category">
          <option value="">— Select —</option>
          <option value="kids">Kids</option><option value="women">Women</option>
          <option value="men">Men</option><option value="accessories">Accessories</option>
        </select>
      </div>
      <div>
        <label>Age Group</label>
        <select id="mp-age">
          <option value="">— Select —</option>
          <option value="0-2">0–2 Years</option><option value="2-5">2–5 Years</option>
          <option value="5-10">5–10 Years</option><option value="10-14">10–14 Years</option>
          <option value="adult">Adult</option>
        </select>
      </div>
      <div>
        <label>GST Slab (%)</label>
        <select id="mp-gst">
          <option value="0">0%</option><option value="5" selected>5%</option>
          <option value="12">12%</option><option value="18">18%</option><option value="28">28%</option>
        </select>
      </div>
      <div>
        <label>Status</label>
        <select id="mp-status">
          <option value="active">Active</option><option value="draft">Draft</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
      </div>
    </div>
    <label>Description</label>
    <textarea id="mp-desc" rows="3" placeholder="Product description…"></textarea>
    <label>Images (up to 5)</label>
    <input type="file" id="mp-image" accept="image/*" multiple>
    <div id="mp-img-preview" class="image-preview-grid" style="margin-top:8px"></div>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
      <input type="checkbox" id="mp-featured">
      <label for="mp-featured" style="margin:0;font-size:12px;letter-spacing:0">Featured on homepage</label>
    </div>
    <div class="form-actions">
      <button class="btn gold" id="mp-save">Save Product</button>
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);

  document.getElementById('mp-image').addEventListener('change', (e) => {
    handleImageSelect(e.target.files);
  });

  document.getElementById('mp-save').addEventListener('click', () => saveProduct());
});

async function saveProduct(editId = null) {
  const name  = document.getElementById('mp-name')?.value.trim();
  const price = Number(document.getElementById('mp-price')?.value);
  if (!name || !price) { toast('Name and price required', 'error'); return; }

  const saveBtn = document.getElementById('mp-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    // Images were already uploaded to Cloudinary via handleImageSelect()
    const payload = {
      name,
      price,
      mrp:        Number(document.getElementById('mp-mrp')?.value) || undefined,
      sku:        document.getElementById('mp-sku')?.value.trim() || undefined,
      category:   document.getElementById('mp-category')?.value || undefined,
      ageGroup:   document.getElementById('mp-age')?.value || undefined,
      gstSlab:    Number(document.getElementById('mp-gst')?.value) || 5,
      description:document.getElementById('mp-desc')?.value.trim() || '',
      featured:   document.getElementById('mp-featured')?.checked || false,
      status:     document.getElementById('mp-status')?.value || 'active',
      ...(_uploadedUrls.length ? { images: _uploadedUrls, image: _uploadedUrls[0] } : {})
    };

    if (editId) {
      await api(`/admin/products/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Product updated', 'success');
    } else {
      await api('/admin/products', { method: 'POST', body: JSON.stringify(payload) });
      toast('Product created', 'success');
    }

    closeModal();
    loadProducts();
  } catch (err) {
    toast(err.message || 'Save failed', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Product';
  }
}

window.editProduct = async (id) => {
  try {
    const data = await api(`/products/${id}`);
    const p    = data.data || data;

    // Pre-populate _uploadedUrls with the product's existing images
    // so saveProduct() sends them back even if the user doesn't change anything
    _uploadedUrls = p.images?.length ? [...p.images] : (p.image ? [p.image] : []);

    openModal(`
      <h2 style="font-size:18px;margin-bottom:20px">Edit Product</h2>
      <div class="form-2col">
        <div><label>Name *</label><input id="mp-name" type="text" value="${p.name || ''}"></div>
        <div><label>SKU</label><input id="mp-sku" type="text" value="${p.sku || ''}"></div>
        <div><label>Price (₹) *</label><input id="mp-price" type="number" value="${p.price || ''}"></div>
        <div><label>MRP (₹)</label><input id="mp-mrp" type="number" value="${p.mrp || ''}"></div>
        <div>
          <label>Category</label>
          <select id="mp-category">
            <option value="">— Select —</option>
            ${['kids','women','men','accessories'].map((c) => `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Status</label>
          <select id="mp-status">
            ${['active','draft','out_of_stock','archived'].map((s) => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div><label>GST Slab (%)</label>
          <select id="mp-gst">${[0,5,12,18,28].map((g) => `<option value="${g}" ${p.gstSlab === g ? 'selected':''}>${g}%</option>`).join('')}</select>
        </div>
        <div><label>Age Group</label>
          <select id="mp-age"><option value="">—</option>${['0-2','2-5','5-10','10-14','adult'].map((a) => `<option value="${a}" ${p.ageGroup === a ? 'selected':''}>${a}</option>`).join('')}</select>
        </div>
      </div>
      <label>Description</label>
      <textarea id="mp-desc" rows="3">${p.description || ''}</textarea>
      <label>Images (up to 5) — add new or remove existing</label>
      <input type="file" id="mp-image" accept="image/*" multiple>
      <div id="mp-img-preview" class="image-preview-grid" style="margin-top:8px"></div>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
        <input type="checkbox" id="mp-featured" ${p.featured ? 'checked' : ''}><label for="mp-featured" style="margin:0;font-size:12px;letter-spacing:0">Featured</label>
      </div>
      <div class="form-actions">
        <button class="btn gold" id="mp-save">Update Product</button>
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
      </div>
    `);

    // Render existing images into the preview grid with remove buttons
    const preview = document.getElementById('mp-img-preview');
    _uploadedUrls.forEach((url) => {
      const ph = document.createElement('div');
      ph.className = 'img-placeholder';
      ph.innerHTML = `
        <img src="${url}" alt="Product image">
        <button type="button" class="img-remove-btn" data-url="${url}">&times;</button>`;
      preview.appendChild(ph);
    });

    // New files → upload immediately via handleImageSelect (same as Add Product)
    document.getElementById('mp-image').addEventListener('change', (e) => {
      handleImageSelect(e.target.files);
    });

    document.getElementById('mp-save').addEventListener('click', () => saveProduct(id));
  } catch (err) { toast(err.message || 'Failed to load product', 'error'); }
};

window.archiveProduct = async (id, name) => {
  if (!confirm(`Archive "${decodeURIComponent(name)}"? It will be hidden from the shop.`)) return;
  try {
    await api(`/admin/products/${id}`, { method: 'DELETE' });
    toast('Product archived', 'success');
    loadProducts();
  } catch (err) { toast(err.message || 'Archive failed', 'error'); }
};

/* ══════════════════════════════════════
   SIZING CONFIGURATION
══════════════════════════════════════ */
const GARMENT_SIZES = ['1Y','2Y','3Y','4Y','5Y','6Y','7Y','8Y','9Y','10Y','11Y','12Y'];
const GARMENT_FIELDS = [
  { key: 'chestWidth',    label: 'Chest W' },
  { key: 'waistWidth',    label: 'Waist W' },
  { key: 'shoulderWidth', label: 'Shoulder' },
  { key: 'garmentLength', label: 'Length' },
  { key: 'sleeveLength',  label: 'Sleeve' },
  { key: 'inseam',        label: 'Inseam' }
];

window.openSizingConfig = async function(productId) {
  try {
    const data = await api(`/products/${productId}`);
    const p    = data.data || data;
    const meas = p.garmentMeasurements || [];
    const getMeas = (size, field) => meas.find(m => m.size === size)?.[field] || '';

    const opt = (arr, cur) => arr.map(v =>
      `<option value="${v}" ${cur === v ? 'selected' : ''}>${v}</option>`
    ).join('');

    openModal(`
      <h2 style="font-size:18px;margin-bottom:4px">Sizing Config</h2>
      <p style="font-size:12px;color:#888;margin-bottom:20px">${p.name}</p>

      <div style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;
                  color:#888;margin-bottom:12px">FIT CONFIGURATION</div>
      <div class="form-2col" style="margin-bottom:16px">
        <div>
          <label>Fit Type</label>
          <select id="sc-fitType">
            ${opt(['slim','regular','relaxed','oversized'], p.fitType || 'regular')}
          </select>
        </div>
        <div>
          <label>Fabric Stretch</label>
          <select id="sc-fabricStretch">
            ${opt(['none','low','medium','high'], p.fabricStretch || 'low')}
          </select>
        </div>
        <div>
          <label>Fabric Thickness</label>
          <select id="sc-fabricThickness">
            ${opt(['thin','medium','thick'], p.fabricThickness || 'medium')}
          </select>
        </div>
        <div>
          <label>Shrinkage % (after first wash)</label>
          <input id="sc-shrinkage" type="number" min="0" max="15" step="0.5"
                 value="${p.shrinkagePercent || 0}">
        </div>
      </div>
      <div style="margin-bottom:12px">
        <label>Fit Note (shown to customer)</label>
        <input id="sc-fitNote" type="text"
               placeholder='e.g. "Runs small — size up recommended"'
               value="${p.fitNote || ''}">
      </div>
      <div style="margin-bottom:20px">
        <label>Size Up Note</label>
        <input id="sc-sizeUpNote" type="text"
               placeholder='e.g. "This product runs one size small"'
               value="${p.sizeUpNote || ''}">
      </div>

      <div style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;
                  color:#888;margin-bottom:6px">GARMENT MEASUREMENTS (cm)</div>
      <div style="font-size:11px;color:#aaa;margin-bottom:12px">
        All widths are half-measurements (garment flat). Leave blank to skip a size.
      </div>
      <div style="overflow-x:auto;margin-bottom:20px">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead>
            <tr style="background:#F8F6F3">
              <th style="padding:8px;text-align:left;font-weight:600;color:#555;
                         border:0.5px solid #E8E5E0">Size</th>
              ${GARMENT_FIELDS.map(f =>
                `<th style="padding:8px;text-align:center;font-weight:600;color:#555;
                            border:0.5px solid #E8E5E0;white-space:nowrap">${f.label}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${GARMENT_SIZES.map(size => `
              <tr>
                <td style="padding:6px 8px;border:0.5px solid #E8E5E0;font-weight:600;
                           color:#0A0A0A;background:#FAFAFA;white-space:nowrap">${size}</td>
                ${GARMENT_FIELDS.map(f => `
                  <td style="padding:3px;border:0.5px solid #E8E5E0">
                    <input type="number" min="0" max="100" step="0.5"
                           id="sc-${size}-${f.key}"
                           value="${getMeas(size, f.key)}"
                           style="width:100%;border:none;text-align:center;
                                  padding:6px 2px;font-size:12px;outline:none;
                                  background:transparent;box-sizing:border-box;
                                  min-width:48px">
                  </td>
                `).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="form-actions">
        <button class="btn gold" onclick="window.saveSizingConfig('${productId}')">
          Save Sizing Config
        </button>
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
      </div>
    `);
  } catch (err) {
    toast(err.message || 'Failed to load product', 'error');
  }
};

window.saveSizingConfig = async function(productId) {
  const garmentMeasurements = GARMENT_SIZES.reduce((acc, size) => {
    const entry = { size };
    let hasAny  = false;
    GARMENT_FIELDS.forEach(({ key }) => {
      const val = parseFloat(document.getElementById(`sc-${size}-${key}`)?.value);
      if (!isNaN(val) && val > 0) { entry[key] = val; hasAny = true; }
    });
    if (hasAny) acc.push(entry);
    return acc;
  }, []);

  const payload = {
    fitType:          document.getElementById('sc-fitType')?.value,
    fabricStretch:    document.getElementById('sc-fabricStretch')?.value,
    fabricThickness:  document.getElementById('sc-fabricThickness')?.value,
    shrinkagePercent: parseFloat(document.getElementById('sc-shrinkage')?.value) || 0,
    fitNote:          document.getElementById('sc-fitNote')?.value.trim()    || '',
    sizeUpNote:       document.getElementById('sc-sizeUpNote')?.value.trim() || '',
    garmentMeasurements
  };

  try {
    await api(`/admin/products/${productId}`, { method: 'PUT', body: JSON.stringify(payload) });
    toast(`Sizing config saved — ${garmentMeasurements.length} size${garmentMeasurements.length !== 1 ? 's' : ''} configured`, 'success');
    closeModal();
    loadProducts();
  } catch (err) {
    toast(err.message || 'Save failed', 'error');
  }
};

/* ══════════════════════════════════════
   BULK PRODUCT UPLOAD
══════════════════════════════════════ */
function openBulkUpload() {
  document.getElementById('bulk-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'bulk-modal';
  modal.style.cssText = [
    'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;',
    'display:flex;align-items:center;justify-content:center;padding:20px'
  ].join('');

  modal.innerHTML = `
    <div style="background:#fff;width:100%;max-width:860px;max-height:90vh;
                overflow-y:auto;border-radius:8px">

      <div style="background:#0A0A0A;padding:20px 24px;border-radius:8px 8px 0 0;
                  display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="color:#C9A84C;font-size:16px;font-weight:600;letter-spacing:0.06em">
            BULK PRODUCT UPLOAD
          </div>
          <div style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:3px">
            Upload Excel, CSV, Word, or PDF — up to 100 products at once
          </div>
        </div>
        <button onclick="document.getElementById('bulk-modal').remove()"
                style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer">
          &#215;
        </button>
      </div>

      <div style="padding:24px">

        <!-- Step 1: Upload -->
        <div id="bulk-step-upload">
          <div style="background:#EAF3DE;border:0.5px solid #1D9E75;border-radius:6px;
                      padding:14px 18px;margin-bottom:20px;display:flex;
                      align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div>
              <div style="font-size:13px;font-weight:500;color:#0A0A0A;margin-bottom:3px">
                &#128196; Download the Sagona Product Template
              </div>
              <div style="font-size:12px;color:#555">
                Fill this template and upload it. Includes all required fields,
                size measurements, and sample data.
              </div>
            </div>
            <a href="/nc_assets/files/Sagona_Product_Upload_Template.xlsx"
               download="Sagona_Product_Upload_Template.xlsx"
               style="padding:9px 18px;background:#1D9E75;color:#fff;text-decoration:none;
                      border-radius:3px;font-size:12px;letter-spacing:0.08em;
                      font-weight:500;white-space:nowrap">
              &#8681; DOWNLOAD TEMPLATE
            </a>
          </div>

          <div id="bulk-drop-zone"
               onclick="document.getElementById('bulk-file-input').click()"
               ondragover="event.preventDefault();this.style.borderColor='#C9A84C'"
               ondragleave="this.style.borderColor='#E8E5E0'"
               ondrop="window.handleBulkDrop(event)"
               style="border:2px dashed #E8E5E0;border-radius:8px;padding:40px 20px;
                      text-align:center;cursor:pointer;transition:border-color 0.2s;
                      background:#FAFAF8;margin-bottom:20px">
            <input type="file" id="bulk-file-input"
                   accept=".xlsx,.xls,.csv,.docx,.pdf"
                   style="display:none"
                   onchange="window.handleBulkFileSelect(this)">
            <div style="font-size:32px;margin-bottom:12px">&#128196;</div>
            <div style="font-size:15px;font-weight:500;color:#0A0A0A;margin-bottom:6px">
              Click to select file or drag and drop here
            </div>
            <div style="font-size:12px;color:#888;margin-bottom:4px">
              Supported: Excel (.xlsx, .xls), CSV, Word (.docx), PDF
            </div>
            <div style="font-size:11px;color:#aaa">Maximum file size: 20MB</div>
          </div>

          <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
            ${[
              { val:'create_and_update', label:'Create new + Update existing', checked:true },
              { val:'create_only',       label:'Create new only (skip existing)', checked:false },
              { val:'update_only',       label:'Update existing only', checked:false }
            ].map(o => `
              <label style="display:flex;align-items:center;gap:7px;cursor:pointer;
                            font-size:13px;padding:10px 14px;border:0.5px solid #E8E5E0;
                            border-radius:5px;flex:1;min-width:140px">
                <input type="radio" name="upload-mode" value="${o.val}"
                       ${o.checked ? 'checked' : ''}
                       style="accent-color:#C9A84C">
                ${o.label}
              </label>
            `).join('')}
          </div>

          <div id="bulk-upload-progress" style="display:none;margin-bottom:16px">
            <div style="height:4px;background:#E8E5E0;border-radius:99px;overflow:hidden">
              <div id="bulk-progress-bar"
                   style="height:100%;background:#C9A84C;border-radius:99px;
                          width:0%;transition:width 0.3s"></div>
            </div>
            <div id="bulk-progress-text"
                 style="font-size:12px;color:#888;margin-top:6px;text-align:center">
              Parsing file...
            </div>
          </div>
        </div>

        <!-- Step 2: Preview -->
        <div id="bulk-step-preview" style="display:none">
          <div id="bulk-preview-content"></div>
        </div>

        <!-- Step 3: Result -->
        <div id="bulk-step-result" style="display:none">
          <div id="bulk-result-content"></div>
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

window.handleBulkDrop = function(event) {
  event.preventDefault();
  document.getElementById('bulk-drop-zone').style.borderColor = '#E8E5E0';
  const file = event.dataTransfer.files[0];
  if (file) _processBulkFile(file);
};

window.handleBulkFileSelect = function(input) {
  if (input.files[0]) _processBulkFile(input.files[0]);
};

async function _processBulkFile(file) {
  const progress = document.getElementById('bulk-upload-progress');
  const bar      = document.getElementById('bulk-progress-bar');
  const text     = document.getElementById('bulk-progress-text');
  const dropZone = document.getElementById('bulk-drop-zone');

  if (progress) progress.style.display = 'block';
  if (bar)      bar.style.width = '20%';
  if (text)     text.textContent = `Parsing ${file.name}...`;
  if (dropZone) dropZone.style.opacity = '0.5';

  try {
    const formData = new FormData();
    formData.append('file', file);

    const data = await api('/admin/products/bulk-parse', { method: 'POST', body: formData });

    if (bar) bar.style.width = '100%';

    setTimeout(() => {
      if (progress) progress.style.display = 'none';
      if (bar)      bar.style.width = '0%';
      if (dropZone) dropZone.style.opacity = '1';
      _showBulkPreview(data.data, file.name);
    }, 400);

  } catch (err) {
    if (progress) progress.style.display = 'none';
    if (dropZone) dropZone.style.opacity = '1';
    if (bar)      bar.style.width = '0%';
    toast('Parse failed: ' + err.message, 'error');
  }
}

function _showBulkPreview(data, filename) {
  document.getElementById('bulk-step-upload').style.display   = 'none';
  document.getElementById('bulk-step-preview').style.display  = 'block';

  const { products, summary, parseErrors } = data;
  window._bulkParsedProducts = products;

  const summaryCards = [
    { label: 'Total found',  val: summary.total,       color: '#0A0A0A' },
    { label: 'Valid',        val: summary.valid,       color: '#1D9E75' },
    { label: 'Invalid',      val: summary.invalid,     color: '#E24B4A' },
    { label: 'Will create',  val: summary.willCreate,  color: '#C9A84C' },
    { label: 'Will update',  val: summary.willUpdate,  color: '#7F77DD' }
  ];

  const rows = products.map((p, i) => {
    const isUpdate   = summary.existingSkus?.includes(p.sku);
    const measCount  = p._garmentMeasurements?.length || 0;
    const statusBadge = p.valid
      ? (isUpdate
          ? '<span style="padding:2px 8px;border-radius:99px;font-size:10px;background:#EEEDFE;color:#7F77DD;font-weight:600">UPDATE</span>'
          : '<span style="padding:2px 8px;border-radius:99px;font-size:10px;background:#EAF3DE;color:#1D9E75;font-weight:600">CREATE</span>')
      : '<span style="padding:2px 8px;border-radius:99px;font-size:10px;background:#FCEBEB;color:#E24B4A;font-weight:600">INVALID</span>';

    const actionCell = p.valid
      ? (p._warnings?.length
          ? `<span title="${p._warnings.join('\n')}" style="font-size:11px;color:#EF9F27;cursor:help">&#9888; ${p._warnings.length} warning${p._warnings.length > 1 ? 's' : ''}</span>`
          : '<span style="color:#1D9E75;font-size:11px">&#10003; Ready</span>')
      : `<span title="${p._errors?.join('\n')}" style="font-size:11px;color:#E24B4A;cursor:help">&#9888; ${p._errors?.[0] || 'Invalid'}</span>`;

    return `
      <tr class="${p.valid ? 'bulk-valid-row' : 'bulk-invalid-row'}"
          style="border-bottom:0.5px solid #E8E5E0;background:${i % 2 === 0 ? '#fff' : '#FAFAF8'}">
        <td style="padding:8px 12px">${statusBadge}</td>
        <td style="padding:8px 12px;font-weight:500;color:#0A0A0A;max-width:200px;
                   white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${p.product_name || '—'}
        </td>
        <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#555">
          ${p.sku || '—'}
        </td>
        <td style="padding:8px 12px;text-align:center">
          ${p.price ? '₹' + p.price : '—'}
        </td>
        <td style="padding:8px 12px;text-align:center">${p.category || '—'}</td>
        <td style="padding:8px 12px;font-size:11px;color:#555;max-width:140px;
                   white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${p.available_sizes || '—'}
        </td>
        <td style="padding:8px 12px;text-align:center">${p.fit_type || 'regular'}</td>
        <td style="padding:8px 12px;text-align:center">
          ${measCount > 0
            ? `<span style="color:#1D9E75;font-weight:500">&#10003; ${measCount} sizes</span>`
            : '<span style="color:#aaa">—</span>'}
        </td>
        <td style="padding:8px 12px">${actionCell}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('bulk-preview-content').innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:14px;font-weight:500;color:#0A0A0A;margin-bottom:12px">
        &#128202; Parse Results: <span style="color:#888;font-weight:400">${filename}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px">
        ${summaryCards.map(s => `
          <div style="background:#F8F6F3;border-radius:6px;padding:12px;
                      text-align:center;border:0.5px solid #E8E5E0">
            <div style="font-size:22px;font-weight:600;color:${s.color}">${s.val}</div>
            <div style="font-size:11px;color:#888;margin-top:2px">${s.label}</div>
          </div>
        `).join('')}
      </div>
      ${summary.duplicateSkusInFile?.length ? `
        <div style="background:#FCEBEB;border-radius:5px;padding:10px 14px;
                    margin-bottom:10px;font-size:12px;color:#E24B4A">
          &#9888; Duplicate SKUs in file: ${summary.duplicateSkusInFile.join(', ')}
          — only the last occurrence will be used.
        </div>` : ''}
      ${summary.existingSkus?.length ? `
        <div style="background:#FAEEDA;border-radius:5px;padding:10px 14px;
                    margin-bottom:10px;font-size:12px;color:#633806">
          &#128204; These SKUs already exist and will be updated:
          ${summary.existingSkus.map(s => `<strong>${s}</strong>`).join(', ')}
        </div>` : ''}
      ${parseErrors?.length ? `
        <div style="background:#FCEBEB;border-radius:5px;padding:10px 14px;
                    margin-bottom:10px;font-size:12px;color:#E24B4A">
          ${parseErrors.map(e => `<div>&#9888; ${e}</div>`).join('')}
        </div>` : ''}
    </div>

    <div style="border:0.5px solid #E8E5E0;border-radius:6px;overflow:hidden;margin-bottom:20px">
      <div style="background:#0A0A0A;padding:10px 14px;display:flex;
                  justify-content:space-between;align-items:center">
        <span style="color:#fff;font-size:12px;font-weight:500;letter-spacing:0.06em">
          PRODUCT PREVIEW
        </span>
        <label style="color:#888;font-size:11px;display:flex;align-items:center;gap:6px;
                      cursor:pointer">
          <input type="checkbox" id="bulk-hide-invalid"
                 onchange="window.toggleBulkInvalidRows()"
                 style="accent-color:#C9A84C">
          Hide invalid rows
        </label>
      </div>
      <div style="overflow-x:auto;max-height:380px;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:800px">
          <thead style="position:sticky;top:0;z-index:1">
            <tr style="background:#1a1a1a">
              ${['STATUS','PRODUCT NAME','SKU','PRICE','CATEGORY','SIZES','FIT','MEASUREMENTS','ACTION']
                .map(h => `<th style="padding:9px 12px;text-align:left;
                                      color:${h==='STATUS'?'#C9A84C':'#fff'};
                                      font-size:10px;letter-spacing:0.06em;
                                      white-space:nowrap">${h}</th>`)
                .join('')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>

    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <button id="bulk-confirm-btn"
              onclick="window.confirmBulkUpload()"
              ${summary.valid === 0 ? 'disabled' : ''}
              style="flex:1;padding:13px;background:#C9A84C;color:#fff;border:none;
                     cursor:pointer;font-size:12px;letter-spacing:0.1em;
                     border-radius:3px;font-family:inherit;font-weight:500;
                     ${summary.valid === 0 ? 'opacity:0.4;cursor:not-allowed;' : ''}">
        &#8679; UPLOAD ${summary.valid} VALID PRODUCT${summary.valid !== 1 ? 'S' : ''}
        ${summary.invalid > 0 ? `(${summary.invalid} invalid will be skipped)` : ''}
      </button>
      <button onclick="document.getElementById('bulk-step-preview').style.display='none';
                       document.getElementById('bulk-step-upload').style.display='block'"
              style="padding:13px 20px;background:transparent;border:0.5px solid #E8E5E0;
                     cursor:pointer;font-size:12px;border-radius:3px;font-family:inherit">
        &#8678; BACK
      </button>
    </div>
  `;
}

window.toggleBulkInvalidRows = function() {
  const hide = document.getElementById('bulk-hide-invalid')?.checked;
  document.querySelectorAll('.bulk-invalid-row').forEach(r => {
    r.style.display = hide ? 'none' : '';
  });
};

window.confirmBulkUpload = async function() {
  const mode = document.querySelector('input[name="upload-mode"]:checked')?.value
    || 'create_and_update';
  const btn = document.getElementById('bulk-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'UPLOADING...'; }

  try {
    const data = await api('/admin/products/bulk-upload', {
      method: 'POST',
      body:   JSON.stringify({ products: window._bulkParsedProducts, mode })
    });
    _showBulkResult(data.data);
  } catch (err) {
    toast('Upload failed: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'RETRY'; }
  }
};

function _showBulkResult(results) {
  document.getElementById('bulk-step-preview').style.display = 'none';
  document.getElementById('bulk-step-result').style.display  = 'block';

  const total = results.created.length + results.updated.length +
                results.failed.length  + results.skipped.length;

  const cards = [
    { label: 'Created', val: results.created.length, color: '#1D9E75', bg: '#EAF3DE' },
    { label: 'Updated', val: results.updated.length, color: '#7F77DD', bg: '#EEEDFE' },
    { label: 'Failed',  val: results.failed.length,  color: '#E24B4A', bg: '#FCEBEB' },
    { label: 'Skipped', val: results.skipped.length, color: '#888',    bg: '#F0EDE8' }
  ];

  document.getElementById('bulk-result-content').innerHTML = `
    <div style="text-align:center;padding:20px 0 28px">
      <div style="font-size:48px;margin-bottom:14px">
        ${results.failed.length === 0 ? '&#127881;' : '&#9888;&#65039;'}
      </div>
      <h3 style="font-family:'Playfair Display',Georgia,serif;font-size:22px;
                 font-weight:500;color:#0A0A0A;margin-bottom:6px">
        Upload Complete
      </h3>
      <p style="font-size:13px;color:#888">${total} products processed</p>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px">
      ${cards.map(s => `
        <div style="background:${s.bg};border-radius:8px;padding:14px;text-align:center">
          <div style="font-size:28px;font-weight:600;color:${s.color}">${s.val}</div>
          <div style="font-size:12px;color:#888;margin-top:2px">${s.label}</div>
        </div>
      `).join('')}
    </div>

    ${results.failed.length ? `
      <div style="background:#FCEBEB;border-radius:6px;padding:14px;margin-bottom:16px">
        <div style="font-size:12px;font-weight:600;color:#E24B4A;margin-bottom:8px">
          FAILED — please check and re-upload:
        </div>
        ${results.failed.map(f => `
          <div style="font-size:12px;color:#E24B4A;margin-bottom:3px">
            &bull; ${f.sku} (${f.name || 'unknown'}) — ${f.reason}
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div style="display:flex;gap:10px">
      <button onclick="document.getElementById('bulk-modal').remove();loadProducts()"
              style="flex:1;padding:12px;background:#0A0A0A;color:#fff;border:none;
                     cursor:pointer;font-size:12px;letter-spacing:0.1em;
                     border-radius:3px;font-family:inherit">
        &#10003; VIEW ALL PRODUCTS
      </button>
      <button onclick="document.getElementById('bulk-step-result').style.display='none';
                       document.getElementById('bulk-step-upload').style.display='block'"
              style="padding:12px 20px;background:transparent;border:0.5px solid #E8E5E0;
                     cursor:pointer;font-size:12px;border-radius:3px;font-family:inherit">
        UPLOAD ANOTHER FILE
      </button>
    </div>
  `;
}

/* ══════════════════════════════════════
   STORES
══════════════════════════════════════ */
async function loadStores() {
  try {
    const data   = await api('/admin/stores?includeInactive=true');
    const stores = Array.isArray(data) ? data : (data.data || []);
    const tbody  = document.getElementById('stores-body');

    if (!stores.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="loading">No stores yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = stores.map((s) => `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.city) || '—'}</td>
        <td>${escapeHtml(s.state) || '—'}</td>
        <td>${escapeHtml(s.pincode) || '—'}</td>
        <td style="font-size:11px">${escapeHtml(s.gstin) || '—'}</td>
        <td>
          <span class="pill ${s.isActive !== false ? 'pill-delivered' : 'pill-cancelled'}"
                style="cursor:pointer" title="Click to toggle active status"
                onclick="toggleStoreActive('${s._id}', ${s.isActive !== false})">
            ${s.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </td>
        <td><button class="btn ghost" style="padding:5px 10px;font-size:10px" onclick="editStore('${s._id}')">Edit</button></td>
      </tr>`).join('');
  } catch { document.getElementById('stores-body').innerHTML = `<tr><td colspan="7" class="loading">Failed to load.</td></tr>`; }
}

document.getElementById('add-store-btn')?.addEventListener('click', () => showStoreModal());

function showStoreModal(s = null) {
  openModal(`
    <h2 style="font-size:18px;margin-bottom:20px">${s ? 'Edit' : 'Add'} Store</h2>
    <div class="form-2col">
      <div><label>Name *</label><input id="st-name" value="${s?.name || ''}"></div>
      <div><label>Phone</label><input id="st-phone" value="${s?.phone || ''}"></div>
      <div><label>City</label><input id="st-city" value="${s?.city || ''}"></div>
      <div><label>State</label><input id="st-state" value="${s?.state || ''}"></div>
      <div><label>Pincode</label><input id="st-pincode" value="${s?.pincode || ''}"></div>
      <div><label>GSTIN</label><input id="st-gstin" value="${s?.gstin || ''}"></div>
      <div><label>Latitude</label><input id="st-lat" type="number" step="any" value="${s?.lat || ''}"></div>
      <div><label>Longitude</label><input id="st-lng" type="number" step="any" value="${s?.lng || ''}"></div>
    </div>
    <label>Address</label>
    <textarea id="st-address" rows="2">${s?.address || ''}</textarea>
    <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
      <input type="checkbox" id="st-dispatch" ${s?.dispatchEnabled !== false ? 'checked' : ''}>
      <label for="st-dispatch" style="margin:0;font-size:12px;letter-spacing:0">Dispatch enabled</label>
    </div>
    <div class="form-actions">
      <button class="btn gold" id="st-save">${s ? 'Update' : 'Create'} Store</button>
      ${s ? `
      <button type="button" class="btn-toggle-store" onclick="toggleStoreActive('${s._id}', ${s.isActive !== false})">
        ${s.isActive !== false ? 'DEACTIVATE' : 'ACTIVATE'}
      </button>
      <button type="button" class="btn-delete-store" onclick="confirmDeleteStore('${s._id}', '${s.name.replace(/'/g, "\\'")}')">
        DELETE
      </button>` : ''}
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);

  document.getElementById('st-save').addEventListener('click', async () => {
    const name = document.getElementById('st-name').value.trim();
    if (!name) { toast('Name required', 'error'); return; }
    const payload = {
      name,
      phone:           document.getElementById('st-phone').value.trim() || undefined,
      city:            document.getElementById('st-city').value.trim() || undefined,
      state:           document.getElementById('st-state').value.trim() || undefined,
      pincode:         document.getElementById('st-pincode').value.trim() || undefined,
      gstin:           document.getElementById('st-gstin').value.trim() || undefined,
      address:         document.getElementById('st-address').value.trim() || undefined,
      lat:             Number(document.getElementById('st-lat').value) || undefined,
      lng:             Number(document.getElementById('st-lng').value) || undefined,
      dispatchEnabled: document.getElementById('st-dispatch').checked
    };
    try {
      if (s) await api(`/admin/stores/${s._id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else   await api('/admin/stores', { method: 'POST', body: JSON.stringify(payload) });
      toast('Store saved', 'success');
      closeModal();
      loadStores();
    } catch (err) { toast(err.message || 'Save failed', 'error'); }
  });
}

window.editStore = async (id) => {
  try {
    const data = await api(`/stores/${id}`);
    showStoreModal(data.data || data);
  } catch { toast('Failed to load store', 'error'); }
};

window.toggleStoreActive = async (storeId, currentlyActive) => {
  const action = currentlyActive ? 'deactivate' : 'activate';
  if (!confirm(`Are you sure you want to ${action} this store?`)) return;
  try {
    const res = await api(`/admin/stores/${storeId}/toggle`, { method: 'PATCH' });
    toast(`Store ${res.data.isActive ? 'activated' : 'deactivated'}`, 'success');
    closeModal();
    loadStores();
  } catch (err) { toast('Failed: ' + err.message, 'error'); }
};

window.confirmDeleteStore = async (storeId, storeName) => {
  if (!confirm(`Delete store "${storeName}"? This cannot be undone.`)) return;
  try {
    await api(`/admin/stores/${storeId}`, { method: 'DELETE' });
    toast('Store deleted', 'success');
    closeModal();
    loadStores();
  } catch (err) { toast('Failed: ' + err.message, 'error'); }
};

/* ══════════════════════════════════════
   ANALYTICS
══════════════════════════════════════ */
let _revChart2 = null, _statusChart2 = null, _topChart = null;

async function loadAnalytics() {
  try {
    const [revData, statusData, topData, invData] = await Promise.allSettled([
      api('/admin/analytics/revenue?period=daily&days=30'),
      api('/admin/analytics/orders'),
      api('/admin/analytics/top-products?limit=8'),
      api('/admin/analytics/inventory?threshold=5')
    ]);

    // Revenue
    const rev = revData.value?.data || [];
    renderLineChart('chart-rev2', rev.map((d) => d._id), rev.map((d) => d.revenue || 0), _revChart2, (c) => _revChart2 = c);

    // Status
    const statusItems = statusData.value?.data?.byStatus || [];
    renderDoughnut('chart-status2', statusItems, _statusChart2, (c) => _statusChart2 = c);

    // Top products
    const top = topData.value?.data || [];
    if (_topChart) _topChart.destroy();
    const ctx = document.getElementById('chart-top-products')?.getContext('2d');
    if (ctx && top.length) {
      _topChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: top.map((t) => t.name || t._id?.slice(-8)),
          datasets: [{
            label: 'Revenue (₹)',
            data:  top.map((t) => t.totalRevenue || 0),
            backgroundColor: '#C9A84C'
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { x: { grid: { color: '#E8E5E0' } }, y: { grid: { display: false } } }
        }
      });
    }

    // Inventory alerts
    const alerts = invData.value?.data || [];
    const invBody = document.getElementById('inventory-body');
    invBody.innerHTML = alerts.length
      ? alerts.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td style="font-size:11px;color:var(--gray)">${escapeHtml(p.sku) || '—'}</td><td><span style="color:#dc2626;font-weight:600">${p.stock ?? '?'}</span></td></tr>`).join('')
      : `<tr><td colspan="3" class="loading">All products well-stocked.</td></tr>`;

  } catch (err) { console.error('loadAnalytics:', err); }
}

/* ══════════════════════════════════════
   GST REPORTS
══════════════════════════════════════ */
document.getElementById('gst-load-btn')?.addEventListener('click', loadGst);
document.getElementById('gst-export-btn')?.addEventListener('click', exportGst);

async function loadGst() {
  const from = document.getElementById('gst-from')?.value;
  const to   = document.getElementById('gst-to')?.value;
  const tbody = document.getElementById('gst-body');
  tbody.innerHTML = `<tr><td colspan="6" class="loading">Loading…</td></tr>`;

  try {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    const data  = await api(`/admin/gst/hsn-summary?${params}`);
    const items = data.data || [];

    tbody.innerHTML = items.length
      ? items.map((r) => `
        <tr>
          <td>${r._id || r.hsn || '—'}</td>
          <td>${INR(r.taxableAmount)}</td>
          <td>${INR(r.cgst)}</td>
          <td>${INR(r.sgst)}</td>
          <td>${INR(r.igst)}</td>
          <td>${INR((r.cgst || 0) + (r.sgst || 0) + (r.igst || 0))}</td>
        </tr>`).join('')
      : `<tr><td colspan="6" class="loading">No data for selected range.</td></tr>`;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading">${err.message}</td></tr>`;
  }
}

async function exportGst() {
  const from = document.getElementById('gst-from')?.value;
  const to   = document.getElementById('gst-to')?.value;
  const token = sessionStorage.getItem('admin_token');
  const params = new URLSearchParams({ format: 'csv' });
  if (from) params.set('from', from);
  if (to)   params.set('to', to);
  const url  = `${API_BASE}/admin/gst/export?${params}`;
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { toast('Export failed', 'error'); return; }
  const blob = await res.blob();
  const a    = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sagona-gst-${from || 'all'}.csv`;
  a.click();
}

/* ══════════════════════════════════════
   ADMIN USERS
══════════════════════════════════════ */
async function loadAdminUsers() {
  try {
    const data  = await api('/admin/auth/users');
    const users = data.data || [];
    const tbody = document.getElementById('users-body');

    tbody.innerHTML = users.length
      ? users.map((u) => `
        <tr>
          <td>${escapeHtml(u.name)}</td>
          <td>${escapeHtml(u.email)}</td>
          <td><span class="pill pill-confirmed">${escapeHtml(u.role)}</span></td>
          <td>${fmt(u.lastLogin)}</td>
          <td><span class="pill ${u.isActive !== false ? 'pill-delivered' : 'pill-cancelled'}">${u.isActive !== false ? 'Active' : 'Inactive'}</span></td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="loading">No admin users found.</td></tr>`;
  } catch { document.getElementById('users-body').innerHTML = `<tr><td colspan="5" class="loading">Failed to load.</td></tr>`; }
}

document.getElementById('add-user-btn')?.addEventListener('click', () => {
  openModal(`
    <h2 style="font-size:18px;margin-bottom:20px">Add Admin User</h2>
    <label>Full Name *</label>
    <input id="au-name" type="text" placeholder="Jane Smith">
    <label>Email *</label>
    <input id="au-email" type="email" placeholder="jane@sagona.in">
    <label>Password *</label>
    <input id="au-password" type="password" placeholder="Min 8 characters">
    <label>Role *</label>
    <select id="au-role">
      <option value="viewer">Viewer</option>
      <option value="content_editor">Content Editor</option>
      <option value="store_manager">Store Manager</option>
      <option value="finance_manager">Finance Manager</option>
      <option value="super_admin">Super Admin</option>
    </select>
    <div class="form-actions">
      <button class="btn gold" id="au-save">Create Admin</button>
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);

  document.getElementById('au-save').addEventListener('click', async () => {
    const name     = document.getElementById('au-name').value.trim();
    const email    = document.getElementById('au-email').value.trim();
    const password = document.getElementById('au-password').value;
    const role     = document.getElementById('au-role').value;
    if (!name || !email || !password) { toast('All fields required', 'error'); return; }
    try {
      await api('/admin/auth/users', { method: 'POST', body: JSON.stringify({ name, email, password, role }) });
      toast('Admin created', 'success');
      closeModal();
      loadAdminUsers();
    } catch (err) { toast(err.message || 'Failed to create admin', 'error'); }
  });
});

/* ══════════════════════════════════════
   2FA SETUP
══════════════════════════════════════ */
document.getElementById('setup-2fa-btn')?.addEventListener('click', async () => {
  try {
    const data = await api('/admin/auth/setup-2fa', { method: 'POST' });
    openModal(`
      <h2 style="font-size:18px;margin-bottom:12px">Enable Two-Factor Authentication</h2>
      <p style="font-size:13px;color:var(--gray);margin-bottom:16px">Scan this QR code with Google Authenticator or Authy, then enter the code to confirm.</p>
      <img id="qr-img" src="${data.data.qrCode}" width="200" height="200">
      <p style="font-size:11px;color:var(--light-gray);text-align:center;margin:8px 0 16px">Manual key: <code>${data.data.secret}</code></p>
      <input id="confirm-code" class="field" type="text" maxlength="6" placeholder="6-digit code" inputmode="numeric">
      <div class="form-actions">
        <button class="btn gold" id="confirm-2fa-btn">Enable 2FA</button>
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
      </div>
    `);
    document.getElementById('confirm-2fa-btn').addEventListener('click', async () => {
      const code = document.getElementById('confirm-code').value.trim();
      try {
        await api('/admin/auth/confirm-2fa', { method: 'POST', body: JSON.stringify({ code }) });
        toast('2FA enabled successfully', 'success');
        closeModal();
      } catch (err) { toast(err.message || 'Invalid code', 'error'); }
    });
  } catch (err) { toast(err.message || '2FA setup failed', 'error'); }
});

/* ══════════════════════════════════════
   IMAGE UPLOAD (multi-file)
══════════════════════════════════════ */
async function handleImageSelect(files) {
  const preview = document.getElementById('mp-img-preview');
  if (!preview) return;
  const fileArr = Array.from(files).slice(0, 5 - _uploadedUrls.length); // max 5 total

  for (const file of fileArr) {
    // Show local preview immediately so user has instant feedback
    const localUrl = URL.createObjectURL(file);
    const ph = document.createElement('div');
    ph.className = 'img-placeholder loading';
    ph.innerHTML = `
      <img src="${localUrl}" alt="preview" style="opacity:0.45">
      <div class="img-upload-overlay">Uploading…</div>`;
    preview.appendChild(ph);

    try {
      const fd = new FormData();
      fd.append('image', file);
      const up  = await api('/admin/upload/image', { method: 'POST', body: fd });
      const url = up.data?.url || up.url;
      if (!url) throw new Error('No URL returned from upload');
      _uploadedUrls.push(url);

      ph.classList.remove('loading');
      ph.innerHTML = `
        <img src="${url}" alt="Product image">
        <button type="button" class="img-remove-btn" data-url="${url}">&times;</button>`;
    } catch (err) {
      toast('Image upload failed: ' + (err.message || 'unknown error'), 'error');
      ph.remove();
      URL.revokeObjectURL(localUrl);
    }
  }
}

// Delegated remove handler — works for any dynamically added remove button
document.getElementById('modal-body').addEventListener('click', (e) => {
  if (!e.target.classList.contains('img-remove-btn')) return;
  const url = e.target.dataset.url;
  const idx = _uploadedUrls.indexOf(url);
  if (idx > -1) _uploadedUrls.splice(idx, 1);
  e.target.closest('.img-placeholder').remove();
});

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */
function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

window.closeModal = closeModal;

/* ══════════════════════════════════════
   HOMEPAGE SECTION MANAGER
══════════════════════════════════════ */
let _hpCurrentMedia = null; // tracks uploaded media for the open form

async function loadHomepageManager() {
  const root = document.getElementById('hp-manager-root');
  root.innerHTML = `
    <div class="admin-page-header">
      <h2>Homepage Sections</h2>
      <button class="btn-primary" onclick="window.hpOpenAdd()">+ ADD SECTION</button>
    </div>
    <p style="color:var(--muted,#999);font-size:13px;margin-bottom:20px">
      Drag rows to reorder. Sections appear in order on sagona.in.
    </p>
    <div id="hp-list" class="hp-sections-list">
      <div style="text-align:center;padding:40px;color:#999">Loading…</div>
    </div>
    <div id="hp-modal" class="modal-overlay" style="display:none">
      <div class="modal-box">
        <div class="modal-header">
          <h3 id="hp-modal-title">Add Section</h3>
          <button onclick="window.hpCloseModal()" style="background:none;border:none;font-size:22px;cursor:pointer;line-height:1">&#215;</button>
        </div>
        <div id="hp-modal-body"></div>
      </div>
    </div>
  `;
  await hpRenderList();
}

async function hpRenderList() {
  const list = document.getElementById('hp-list');
  if (!list) return;
  try {
    const res = await api('/admin/homepage/sections');
    const sections = res.data || [];
    if (!sections.length) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:#999">No sections yet. Click + ADD SECTION to start.</div>';
      return;
    }
    list.innerHTML = sections.map((s, i) => hpSectionRow(s, i)).join('');
    hpInitDrag();
  } catch (err) {
    list.innerHTML = `<div style="color:red;padding:20px">${err.message}</div>`;
  }
}

function hpSectionRow(s, i) {
  const labels = { hero:'Hero', editorial:'Editorial', feature:'Feature', split:'Split', strip:'Strip', products:'Products' };
  const preview = s.mediaUrl
    ? (s.mediaType === 'video'
        ? `<video src="${s.mediaUrl}" style="width:80px;height:50px;object-fit:cover;border-radius:3px" muted></video>`
        : `<img src="${s.mediaUrl}" style="width:80px;height:50px;object-fit:cover;border-radius:3px" alt="">`)
    : `<div style="width:80px;height:50px;background:#F0EDE8;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#999">${labels[s.type]||s.type}</div>`;
  return `
    <div class="hp-section-row" data-id="${s._id}" data-order="${s.order ?? i}">
      <div class="hp-drag-handle" title="Drag to reorder">&#8942;&#8942;</div>
      ${preview}
      <div class="hp-section-info">
        <div class="hp-section-type">${labels[s.type] || s.type}</div>
        <div class="hp-section-title">${s.title || s.text || s.label || '(no title)'}</div>
        ${s.category ? `<div class="hp-section-cat">Category: ${s.category}</div>` : ''}
      </div>
      <div class="hp-section-status">
        <span class="status-badge ${s.isActive ? 'active' : 'inactive'}">${s.isActive ? 'LIVE' : 'HIDDEN'}</span>
      </div>
      <div class="hp-section-actions">
        <button class="btn-icon" title="Edit" onclick="window.hpOpenEdit('${s._id}')">&#9998;</button>
        <button class="btn-icon" title="${s.isActive ? 'Hide' : 'Show'}" onclick="window.hpToggle('${s._id}',${s.isActive})">
          ${s.isActive ? '&#128065;' : '&#128683;'}
        </button>
        <button class="btn-icon danger" title="Delete" onclick="window.hpDelete('${s._id}')">&#128465;</button>
      </div>
    </div>
  `;
}

// ── DRAG-AND-DROP REORDER ────────────────────────────────────
function hpInitDrag() {
  const list = document.getElementById('hp-list');
  if (!list) return;
  let dragging = null;

  list.querySelectorAll('.hp-section-row').forEach(row => {
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', () => { dragging = row; row.classList.add('dragging'); });
    row.addEventListener('dragend',   () => { row.classList.remove('dragging'); dragging = null; hpSaveOrder(); });
    row.addEventListener('dragover',  e => {
      e.preventDefault();
      if (!dragging || dragging === row) return;
      const rows  = [...list.querySelectorAll('.hp-section-row')];
      const idx   = rows.indexOf(row);
      const didx  = rows.indexOf(dragging);
      list.insertBefore(dragging, didx < idx ? row.nextSibling : row);
    });
  });
}

async function hpSaveOrder() {
  const rows = [...document.querySelectorAll('#hp-list .hp-section-row')];
  const order = rows.map((r, i) => ({ id: r.dataset.id, order: i }));
  try {
    await api('/admin/homepage/reorder', { method: 'PUT', body: JSON.stringify({ order }) });
  } catch (err) {
    toast('Failed to save order: ' + err.message, 'error');
  }
}

// ── OPEN / CLOSE MODAL ───────────────────────────────────────
window.hpOpenAdd = function() {
  _hpCurrentMedia = null;
  document.getElementById('hp-modal-title').textContent = 'Add Section';
  document.getElementById('hp-modal-body').innerHTML = hpBuildForm(null);
  document.getElementById('hp-modal').style.display = 'flex';
};

window.hpOpenEdit = async function(id) {
  _hpCurrentMedia = null;
  try {
    const res = await api('/admin/homepage/sections');
    const s   = (res.data || []).find(x => x._id === id);
    if (!s) return;
    document.getElementById('hp-modal-title').textContent = 'Edit Section';
    document.getElementById('hp-modal-body').innerHTML = hpBuildForm(s);
    document.getElementById('hp-modal').style.display = 'flex';
    // Pre-populate media state from existing section
    if (s.mediaUrl) {
      _hpCurrentMedia = { url: s.mediaUrl, type: s.mediaType || 'image', publicId: s.mediaPublicId, posterUrl: s.posterUrl };
    }
  } catch (err) {
    toast('Failed to load section: ' + err.message, 'error');
  }
};

window.hpCloseModal = function() {
  const modal = document.getElementById('hp-modal');
  if (modal) modal.style.display = 'none';
  _hpCurrentMedia = null;
};

// ── BUILD FORM ────────────────────────────────────────────────
function hpBuildForm(s) {
  const type = s?.type || 'hero';
  const types = ['hero','editorial','feature','split','strip','products'];
  return `
    <div>
      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">Section Type *</label>
        <select id="hp-type" onchange="hpOnTypeChange(this)" style="width:100%;padding:9px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px;font-family:inherit">
          ${types.map(t => `<option value="${t}" ${type===t?'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}
        </select>
        <div style="font-size:11px;color:#999;margin-top:4px">
          hero / editorial / feature: fullscreen media · split: two columns · strip: text band · products: product grid
        </div>
      </div>

      <div id="hp-type-fields">${hpTypeFields(s)}</div>

      <div id="hp-text-fields">${hpTextFields(s)}</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div>
          <label class="form-label">Display Order</label>
          <input type="number" id="hp-order" value="${s?.order ?? 0}" min="0"
                 style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px">
        </div>
        <div>
          <label class="form-label">Status</label>
          <select id="hp-active" style="width:100%;padding:9px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px;font-family:inherit">
            <option value="true"  ${s?.isActive!==false?'selected':''}>Live (visible)</option>
            <option value="false" ${s?.isActive===false?'selected':''}>Hidden</option>
          </select>
        </div>
      </div>

      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn-primary" onclick="window.hpSave('${s?._id||''}')" style="flex:1">
          ${s ? 'Update Section' : 'Add Section'}
        </button>
        <button onclick="window.hpCloseModal()" style="padding:10px 20px;border:0.5px solid var(--border);background:transparent;cursor:pointer;border-radius:4px;font-family:inherit">
          Cancel
        </button>
      </div>
    </div>
  `;
}

window.hpOnTypeChange = function(sel) {
  document.getElementById('hp-type-fields').innerHTML = hpTypeFields({ type: sel.value });
  document.getElementById('hp-text-fields').innerHTML  = hpTextFields({ type: sel.value });
  _hpCurrentMedia = null;
};

function hpTypeFields(s) {
  const type = s?.type || 'hero';
  if (type === 'strip') return `
    <div class="form-group" style="margin-bottom:16px">
      <label class="form-label">Strip Text</label>
      <input type="text" id="hp-strip-text" value="${s?.text||''}" placeholder="NEW COLLECTION COMING SOON"
             style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px">
    </div>`;

  if (type === 'products') return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div>
        <label class="form-label">Section Heading</label>
        <input type="text" id="hp-prod-title" value="${s?.title||'NEW ARRIVALS'}"
               style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px">
      </div>
      <div>
        <label class="form-label">Category filter (optional)</label>
        <input type="text" id="hp-prod-cat" value="${s?.category||''}" placeholder="kids / women / men"
               style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px">
      </div>
      <div>
        <label class="form-label">Number of products</label>
        <input type="number" id="hp-prod-limit" value="${s?.limit||8}" min="2" max="12"
               style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px">
      </div>
      <div>
        <label class="form-label">View All link</label>
        <input type="text" id="hp-prod-link" value="${s?.viewAllLink||'shop.html'}"
               style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px">
      </div>
      <div style="grid-column:1/-1">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="hp-prod-featured" ${s?.featured?'checked':''}>
          Show featured products only
        </label>
      </div>
    </div>`;

  if (type === 'split') return hpSplitFields(s);

  // hero / editorial / feature — media upload
  return hpMediaField(s);
}

function hpMediaField(s) {
  const hasMedia = s?.mediaUrl;
  const isVideo  = s?.mediaType === 'video';
  const preview  = hasMedia
    ? (isVideo
        ? `<video src="${s.mediaUrl}" style="width:100%;max-height:200px;object-fit:cover;border-radius:6px" controls muted></video>`
        : `<img src="${s.mediaUrl}" style="width:100%;max-height:200px;object-fit:cover;border-radius:6px" alt="">`)
    : `<div style="height:120px;background:#F0EDE8;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;color:#999;border:2px dashed #E8E5E0">No media yet</div>`;

  return `
    <div class="form-group" style="margin-bottom:16px">
      <label class="form-label">
        Media — Image or Video *
        <span style="font-size:11px;font-weight:400;color:#999"> (images: JPG/PNG/WebP · videos: MP4/MOV, max 200MB)</span>
      </label>
      <div id="hp-media-preview" style="margin-bottom:12px">${preview}</div>
      <div class="hp-upload-area" onclick="document.getElementById('hp-file-input').click()">
        <input type="file" id="hp-file-input" accept="image/*,video/*" style="display:none" onchange="window.hpUploadMedia(this)">
        <div style="text-align:center;padding:18px">
          <div style="font-size:22px;margin-bottom:6px">&#128247;</div>
          <div style="font-size:13px;font-weight:500">Click to upload image or video</div>
        </div>
      </div>
      <div id="hp-upload-progress" style="display:none;margin-top:8px">
        <div style="background:#E8E5E0;border-radius:99px;height:4px"><div id="hp-upload-bar" style="height:100%;background:var(--gold);border-radius:99px;width:0%;transition:width 0.3s"></div></div>
        <div id="hp-upload-status" style="font-size:12px;color:#999;margin-top:4px">Uploading…</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:14px">
        <div>
          <label class="form-label">Text Position</label>
          <select id="hp-pos" style="width:100%;padding:9px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px;font-family:inherit">
            <option value="bottom-left"  ${s?.textPosition==='bottom-left'||!s?.textPosition?'selected':''}>Bottom Left</option>
            <option value="center"       ${s?.textPosition==='center'?'selected':''}>Centre</option>
            <option value="bottom-right" ${s?.textPosition==='bottom-right'?'selected':''}>Bottom Right</option>
            <option value="top-left"     ${s?.textPosition==='top-left'?'selected':''}>Top Left</option>
          </select>
        </div>
        <div>
          <label class="form-label">Text Colour</label>
          <select id="hp-text-color" style="width:100%;padding:9px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px;font-family:inherit">
            <option value="light" ${s?.textColor!=='dark'?'selected':''}>White</option>
            <option value="dark"  ${s?.textColor==='dark'?'selected':''}>Black</option>
          </select>
        </div>
        <div>
          <label class="form-label">Overlay</label>
          <select id="hp-overlay" style="width:100%;padding:9px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px;font-family:inherit">
            <option value="default" ${!s?.overlay||s?.overlay==='default'?'selected':''}>Subtle dark</option>
            <option value="dark"    ${s?.overlay==='dark'?'selected':''}>Dark</option>
            <option value="light"   ${s?.overlay==='light'?'selected':''}>Light</option>
            <option value="none"    ${s?.overlay==='none'?'selected':''}>None</option>
          </select>
        </div>
      </div>
    </div>`;
}

function hpSplitFields(s) {
  function col(side, m) {
    const hasMedia = m?.url;
    const isVideo  = m?.type === 'video';
    const preview  = hasMedia
      ? (isVideo
          ? `<video src="${m.url}" style="width:100%;height:120px;object-fit:cover;border-radius:4px" muted></video>`
          : `<img src="${m.url}" style="width:100%;height:120px;object-fit:cover;border-radius:4px" alt="">`)
      : `<div style="height:80px;background:#F0EDE8;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#999">No media</div>`;
    return `
      <div style="border:0.5px solid var(--border);border-radius:6px;padding:14px">
        <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;font-weight:500">${side.toUpperCase()} COLUMN</div>
        <div id="hp-${side}-preview" style="margin-bottom:8px">${preview}</div>
        <div class="hp-upload-area" onclick="document.getElementById('hp-${side}-file').click()" style="margin-bottom:10px">
          <input type="file" id="hp-${side}-file" accept="image/*,video/*" style="display:none" onchange="window.hpUploadSplit(this,'${side}')">
          <div style="text-align:center;padding:10px;font-size:12px">&#128247; Upload</div>
        </div>
        <input type="text" id="hp-${side}-text" placeholder="Text overlay (optional)" value="${m?.text||''}"
               style="width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:4px;font-size:12px;margin-bottom:6px">
        <input type="text" id="hp-${side}-label" placeholder="Label (optional)" value="${m?.label||''}"
               style="width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:4px;font-size:12px;margin-bottom:6px">
        <input type="text" id="hp-${side}-cta" placeholder="CTA text (optional)" value="${m?.cta||''}"
               style="width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:4px;font-size:12px;margin-bottom:6px">
        <input type="text" id="hp-${side}-link" placeholder="CTA link (e.g. shop.html)" value="${m?.ctaLink||''}"
               style="width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:4px;font-size:12px">
      </div>`;
  }
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
    ${col('left', s?.leftMedia)}${col('right', s?.rightMedia)}
  </div>`;
}

function hpTextFields(s) {
  const type = s?.type || 'hero';
  if (type === 'strip' || type === 'products') return '';
  if (type === 'split') return '';
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div>
        <label class="form-label">Label (small uppercase text)</label>
        <input type="text" id="hp-label" value="${s?.label||''}" placeholder="NEW COLLECTION · 2026"
               style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px">
      </div>
      <div>
        <label class="form-label">CTA Button Text</label>
        <input type="text" id="hp-cta" value="${s?.cta||''}" placeholder="EXPLORE COLLECTION"
               style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px">
      </div>
      <div style="grid-column:1/-1">
        <label class="form-label">Title</label>
        <input type="text" id="hp-title" value="${s?.title||''}" placeholder="Luxury Kidswear for Modern Families"
               style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px">
      </div>
      <div style="grid-column:1/-1">
        <label class="form-label">Subtitle (optional)</label>
        <input type="text" id="hp-subtitle" value="${s?.subtitle||''}" placeholder="Discover the new collection"
               style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px">
      </div>
      <div style="grid-column:1/-1">
        <label class="form-label">CTA Link</label>
        <input type="text" id="hp-cta-link" value="${s?.ctaLink||''}" placeholder="shop.html or shop.html?category=kids"
               style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:4px;font-size:13px">
      </div>
    </div>`;
}

// ── MEDIA UPLOAD ─────────────────────────────────────────────
window.hpUploadMedia = async function(input) {
  const file = input.files[0];
  if (!file) return;

  const progress = document.getElementById('hp-upload-progress');
  const bar      = document.getElementById('hp-upload-bar');
  const status   = document.getElementById('hp-upload-status');
  const preview  = document.getElementById('hp-media-preview');
  if (progress) progress.style.display = 'block';
  if (status)   status.textContent = 'Uploading to Cloudinary…';
  if (bar)      bar.style.width = '30%';

  try {
    const fd = new FormData();
    fd.append('media', file);
    const res = await api('/admin/homepage/upload', { method: 'POST', body: fd });
    _hpCurrentMedia = res.data;
    if (bar)    bar.style.width = '100%';
    if (status) status.textContent = 'Upload complete';

    if (preview) {
      preview.innerHTML = res.data.type === 'video'
        ? `<video src="${res.data.url}" style="width:100%;max-height:200px;object-fit:cover;border-radius:6px" controls muted></video>`
        : `<img src="${res.data.url}" style="width:100%;max-height:200px;object-fit:cover;border-radius:6px" alt="">`;
    }
    setTimeout(() => { if (progress) progress.style.display = 'none'; }, 1500);
  } catch (err) {
    if (status) status.textContent = 'Upload failed: ' + err.message;
    if (bar) bar.style.width = '0%';
    toast('Upload failed: ' + err.message, 'error');
  }
};

let _hpSplitMedia = { left: null, right: null };
window.hpUploadSplit = async function(input, side) {
  const file = input.files[0];
  if (!file) return;
  const preview = document.getElementById(`hp-${side}-preview`);
  try {
    const fd = new FormData();
    fd.append('media', file);
    const res = await api('/admin/homepage/upload', { method: 'POST', body: fd });
    _hpSplitMedia[side] = res.data;
    if (preview) {
      preview.innerHTML = res.data.type === 'video'
        ? `<video src="${res.data.url}" style="width:100%;height:120px;object-fit:cover;border-radius:4px" muted></video>`
        : `<img src="${res.data.url}" style="width:100%;height:120px;object-fit:cover;border-radius:4px" alt="">`;
    }
    toast('Uploaded', 'success');
  } catch (err) {
    toast('Upload failed: ' + err.message, 'error');
  }
};

// ── SAVE ─────────────────────────────────────────────────────
window.hpSave = async function(id) {
  const type = document.getElementById('hp-type')?.value;
  if (!type) return;

  const body = {
    type,
    order:    parseInt(document.getElementById('hp-order')?.value) || 0,
    isActive: document.getElementById('hp-active')?.value === 'true',
  };

  if (type === 'strip') {
    body.text = document.getElementById('hp-strip-text')?.value || '';

  } else if (type === 'products') {
    body.title       = document.getElementById('hp-prod-title')?.value || 'NEW ARRIVALS';
    body.category    = document.getElementById('hp-prod-cat')?.value || '';
    body.limit       = parseInt(document.getElementById('hp-prod-limit')?.value) || 8;
    body.viewAllLink = document.getElementById('hp-prod-link')?.value || 'shop.html';
    body.featured    = document.getElementById('hp-prod-featured')?.checked || false;

  } else if (type === 'split') {
    const colData = (side, media) => ({
      url:     media?.url || '',
      type:    media?.type || 'image',
      poster:  media?.posterUrl || '',
      publicId: media?.publicId || '',
      text:    document.getElementById(`hp-${side}-text`)?.value  || '',
      label:   document.getElementById(`hp-${side}-label`)?.value || '',
      cta:     document.getElementById(`hp-${side}-cta`)?.value   || '',
      ctaLink: document.getElementById(`hp-${side}-link`)?.value  || '',
    });
    body.leftMedia  = colData('left',  _hpSplitMedia.left);
    body.rightMedia = colData('right', _hpSplitMedia.right);

  } else {
    // hero / editorial / feature
    if (!_hpCurrentMedia) {
      toast('Please upload an image or video first', 'error');
      return;
    }
    body.mediaType    = _hpCurrentMedia.type;
    body.mediaUrl     = _hpCurrentMedia.url;
    body.mediaPublicId = _hpCurrentMedia.publicId;
    body.posterUrl    = _hpCurrentMedia.posterUrl || '';
    body.textPosition = document.getElementById('hp-pos')?.value || 'bottom-left';
    body.textColor    = document.getElementById('hp-text-color')?.value || 'light';
    body.overlay      = document.getElementById('hp-overlay')?.value || 'default';
    body.label    = document.getElementById('hp-label')?.value    || '';
    body.title    = document.getElementById('hp-title')?.value    || '';
    body.subtitle = document.getElementById('hp-subtitle')?.value || '';
    body.cta      = document.getElementById('hp-cta')?.value      || '';
    body.ctaLink  = document.getElementById('hp-cta-link')?.value || '';
  }

  try {
    if (id) {
      await api(`/admin/homepage/sections/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      toast('Section updated');
    } else {
      await api('/admin/homepage/sections', { method: 'POST', body: JSON.stringify(body) });
      toast('Section added');
    }
    window.hpCloseModal();
    await hpRenderList();
  } catch (err) {
    toast('Save failed: ' + err.message, 'error');
  }
};

// ── TOGGLE / DELETE ───────────────────────────────────────────
window.hpToggle = async function(id, isActive) {
  try {
    await api(`/admin/homepage/sections/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ isActive: !isActive })
    });
    toast(isActive ? 'Section hidden' : 'Section live');
    await hpRenderList();
  } catch (err) {
    toast('Failed: ' + err.message, 'error');
  }
};

window.hpDelete = async function(id) {
  if (!confirm('Delete this section? This cannot be undone.')) return;
  try {
    await api(`/admin/homepage/sections/${id}`, { method: 'DELETE' });
    toast('Section deleted');
    await hpRenderList();
  } catch (err) {
    toast('Delete failed: ' + err.message, 'error');
  }
};

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
(async () => {
  const authed = await checkAuth();
  if (authed) startApp();
})();
