import { request } from './api.js';
import { getAuth } from './storage.js';

const auth = getAuth();
if (!auth || auth.user.role !== 'admin') location.href = 'login.html';

const productForm = document.querySelector('#product-form');
const productsWrap = document.querySelector('#admin-products');
const ordersWrap = document.querySelector('#admin-orders');

async function loadDashboard() {
  const [products, orders] = await Promise.all([request('/products'), request('/orders')]);

  document.querySelector('#total-orders').textContent = String(orders.length);
  document.querySelector('#total-revenue').textContent = `₹${orders.reduce((s, o) => s + (o.total || 0), 0)}`;

  productsWrap.innerHTML = products.map((p) => `<div class="table-row"><span>${p.name} - ₹${p.price}</span><button class="btn ghost del-product" data-id="${p._id}">Delete</button></div>`).join('');

  ordersWrap.innerHTML = orders.map((o) => `<div class="panel"><strong>${o.customer?.name || 'Guest'}</strong> (${o.customer?.email || 'N/A'})<p>Total: ₹${o.total} | Payment: ${o.paymentMethod}</p><p>Address: ${o.address}</p><p>Status: <span class="badge ${o.status === 'DELIVERED' ? 'delivered':'pending'}">${o.status}</span></p>${o.status !== 'DELIVERED' ? `<button class="btn gold deliver" data-id="${o._id}">Mark DELIVERED</button>` : ''}</div>`).join('');
}

productForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  payload.price = Number(payload.price);
  payload.featured = payload.featured === 'on';
  await request('/products', { method: 'POST', body: JSON.stringify(payload) });
  e.target.reset();
  loadDashboard();
});

productsWrap?.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('del-product')) return;
  await request(`/products/${e.target.dataset.id}`, { method: 'DELETE' });
  loadDashboard();
});

ordersWrap?.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('deliver')) return;
  await request(`/orders/${e.target.dataset.id}`, { method: 'PUT', body: JSON.stringify({ status: 'DELIVERED' }) });
  loadDashboard();
});

loadDashboard();
