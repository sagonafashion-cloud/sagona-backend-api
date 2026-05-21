import { API_BASE } from './config.js';

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
  const token = localStorage.getItem('admin_token');
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
  const token = localStorage.getItem('admin_token');
  if (!token) return false;
  try {
    const data = await api('/admin/auth/me');
    _adminUser = data.data;
    return true;
  } catch {
    localStorage.removeItem('admin_token');
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
      localStorage.setItem('admin_token', data.token);
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
    localStorage.setItem('admin_token', data.token);
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
document.getElementById('logout-btn').addEventListener('click', async () => {
  try { await api('/admin/auth/logout', { method: 'POST' }); } catch {}
  localStorage.removeItem('admin_token');
  location.reload();
});

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
}

/* ══════════════════════════════════════
   NAVIGATION
══════════════════════════════════════ */
const SECTIONS = ['dashboard','orders','products','stores','analytics','gst','users'];

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
    products:  loadProducts,
    stores:    loadStores,
    analytics: loadAnalytics,
    gst:       () => {},          // loaded on demand
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
  const STATUS_OPTS = ['placed','confirmed','packed','shipped','delivered','returned','cancelled'];
  const tbody = document.getElementById(tbodyId);
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="${showActions ? 8 : 5}" class="loading">No orders found.</td></tr>`;
    return;
  }
  tbody.innerHTML = orders.map((o) => `
    <tr>
      <td><a href="#" style="color:var(--gold)">${o.orderNumber || o._id?.slice(-8)}</a></td>
      <td>${o.customer?.name || '—'}<br><span style="font-size:11px;color:var(--gray)">${o.customer?.email || ''}</span></td>
      ${showActions ? `<td>${(o.items || []).length} items</td>` : ''}
      <td>${INR(o.billing?.grandTotal)}</td>
      ${showActions ? `<td style="font-size:11px">${o.payment?.method || '—'}</td>` : ''}
      <td><span class="pill pill-${o.status}">${o.status || '—'}</span></td>
      <td>${fmt(o.createdAt)}</td>
      ${showActions ? `
      <td>
        <select class="status-select" data-order-id="${o._id}" data-current="${o.status}">
          ${STATUS_OPTS.map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>` : ''}
    </tr>`).join('');

  // status change listener
  tbody.querySelectorAll('.status-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/admin/orders/${sel.dataset.orderId}/status`, {
          method: 'PUT',
          body:   JSON.stringify({ status: sel.value })
        });
        toast('Order status updated', 'success');
        if (tbodyId === 'orders-body') loadOrders();
      } catch (err) {
        toast(err.message || 'Update failed', 'error');
        sel.value = sel.dataset.current;
      }
    });
  });
}

// Order filters
document.getElementById('order-search')?.addEventListener('input', debounce(() => { _ordersPage = 1; loadOrders(); }, 400));
document.getElementById('order-status-filter')?.addEventListener('change', () => { _ordersPage = 1; loadOrders(); });

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
      <td>${p.name}</td>
      <td style="font-size:11px;color:var(--gray)">${p.sku || '—'}</td>
      <td>${INR(p.price)}${p.mrp && p.mrp > p.price ? ` <span style="font-size:11px;color:var(--light-gray);text-decoration:line-through">${INR(p.mrp)}</span>` : ''}</td>
      <td><span style="font-size:11px;text-transform:capitalize">${p.category || '—'}</span></td>
      <td><span class="pill ${p.status === 'active' ? 'pill-delivered' : 'pill-placed'}">${p.status || 'active'}</span></td>
      <td style="white-space:nowrap">
        <button class="btn ghost" style="padding:5px 10px;font-size:10px" onclick="editProduct('${p._id}')">Edit</button>
        <button class="btn ghost" style="padding:5px 10px;font-size:10px;color:#dc2626" onclick="archiveProduct('${p._id}','${p.name}')">Archive</button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('product-search')?.addEventListener('input', debounce(loadProducts, 400));
document.getElementById('product-category-filter')?.addEventListener('change', loadProducts);
document.getElementById('product-status-filter')?.addEventListener('change', loadProducts);

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

  document.getElementById('mp-save').addEventListener('click', saveProduct);
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
  if (!confirm(`Archive "${name}"? It will be hidden from the shop.`)) return;
  try {
    await api(`/admin/products/${id}`, { method: 'DELETE' });
    toast('Product archived', 'success');
    loadProducts();
  } catch (err) { toast(err.message || 'Archive failed', 'error'); }
};

/* ══════════════════════════════════════
   STORES
══════════════════════════════════════ */
async function loadStores() {
  try {
    const data   = await api('/stores');
    const stores = Array.isArray(data) ? data : (data.data || []);
    const tbody  = document.getElementById('stores-body');

    if (!stores.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="loading">No stores yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = stores.map((s) => `
      <tr>
        <td>${s.name}</td>
        <td>${s.city || '—'}</td>
        <td>${s.state || '—'}</td>
        <td>${s.pincode || '—'}</td>
        <td style="font-size:11px">${s.gstin || '—'}</td>
        <td><span class="pill ${s.isActive !== false ? 'pill-delivered' : 'pill-cancelled'}">${s.isActive !== false ? 'Yes' : 'No'}</span></td>
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
      ? alerts.map((p) => `<tr><td>${p.name}</td><td style="font-size:11px;color:var(--gray)">${p.sku || '—'}</td><td><span style="color:#dc2626;font-weight:600">${p.stock ?? '?'}</span></td></tr>`).join('')
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
  const token = localStorage.getItem('admin_token');
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
          <td>${u.name}</td>
          <td>${u.email}</td>
          <td><span class="pill pill-confirmed">${u.role}</span></td>
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
    // Show uploading placeholder immediately
    const ph = document.createElement('div');
    ph.className = 'img-placeholder loading';
    ph.textContent = 'Uploading…';
    preview.appendChild(ph);

    try {
      const fd = new FormData();
      fd.append('image', file);
      // POST /api/admin/upload/image
      const up  = await api('/admin/upload/image', { method: 'POST', body: fd });
      const url = up.data?.url || up.url;
      _uploadedUrls.push(url);

      ph.innerHTML = `
        <img src="${url}" alt="Product image">
        <button type="button" class="img-remove-btn" data-url="${url}">&times;</button>`;
      ph.classList.remove('loading');
    } catch (err) {
      toast('Upload failed: ' + (err.message || 'unknown error'), 'error');
      ph.remove();
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
   INIT
══════════════════════════════════════ */
(async () => {
  const authed = await checkAuth();
  if (authed) startApp();
})();
