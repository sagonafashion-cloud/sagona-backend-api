// cart.js
import { getCart, saveCart } from './storage.js';

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Stable per-variant identifier — mirrors the key product.js writes
const getCartKey = (item) =>
  item.key || item.cartKey || `${item.id || item._id}_${item.size || ''}_${item.colour || ''}`;

/* ══════════════════════════════════════════
   CART PAGE (cart.html)
══════════════════════════════════════════ */
const container = document.getElementById('cart-list');
const totalEl   = document.getElementById('cart-total');

if (container && totalEl) {
  renderCart();

  document.addEventListener('click', (e) => {
    if (!e.target.classList.contains('remove')) return;
    const keyToRemove = e.target.dataset.key;
    const updated = getCart().filter(item => getCartKey(item) !== keyToRemove);
    saveCart(updated);
    renderCart();
    renderDrawer(); // keep drawer in sync if open
  });
}

function renderCart() {
  const cart = getCart();

  if (!cart.length) {
    container.innerHTML = `
      <div class="empty-cart">
        <p>Your cart is empty</p>
        <a href="shop.html" class="btn gold">Continue Shopping</a>
      </div>`;
    totalEl.textContent = '₹0';
    return;
  }

  let total = 0;
  container.innerHTML = cart.map(item => {
    const itemTotal = item.price * (item.quantity || 1);
    total += itemTotal;
    const label = [item.size, item.colour].filter(Boolean).join(' / ');
    return `
      <div class="table-row">
        <img src="${item.image || ''}" style="width:60px;height:60px;object-fit:cover"
             onerror="this.style.display='none'">
        <span>${item.name}${label ? ` <span style="font-size:12px;color:#888">(${label})</span>` : ''}</span>
        <span>₹${item.price}</span>
        <span>Qty: ${item.quantity || 1}</span>
        <span>₹${itemTotal}</span>
        <button class="remove" data-key="${getCartKey(item)}">Remove</button>
      </div>`;
  }).join('');

  totalEl.textContent = INR(total);
}

/* ══════════════════════════════════════════
   CART DRAWER (index.html + product pages)
══════════════════════════════════════════ */
function renderDrawer() {
  const drawerItems = document.getElementById('drawer-items');
  const drawerTotal = document.getElementById('drawer-total');
  if (!drawerItems) return;

  const cart = getCart();

  if (!cart.length) {
    drawerItems.innerHTML = '<p style="text-align:center;padding:32px 16px;color:#888;font-size:13px">Your bag is empty</p>';
    if (drawerTotal) drawerTotal.textContent = '₹0';
    return;
  }

  drawerItems.innerHTML = cart.map(item => {
    const label = [item.size, item.colour].filter(Boolean).join(' · ');
    const lineTotal = (item.price || 0) * (item.quantity || 1);
    return `
      <div style="display:flex;gap:12px;padding:14px 0;border-bottom:0.5px solid #E8E5E0">
        <img src="${item.image || ''}" alt="${item.name}"
             style="width:64px;height:80px;object-fit:cover;flex-shrink:0;background:#F8F6F3"
             onerror="this.style.display='none'">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>
          ${label ? `<div style="font-size:11px;color:#888;margin-top:2px">${label}</div>` : ''}
          <div style="font-size:13px;margin-top:4px">${INR(item.price)} × ${item.quantity || 1}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:13px;font-weight:500">${INR(lineTotal)}</div>
          <button onclick="removeFromDrawer('${getCartKey(item)}')"
                  style="margin-top:8px;border:none;background:none;color:#999;font-size:11px;cursor:pointer;padding:0">Remove</button>
        </div>
      </div>`;
  }).join('');

  const total = cart.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
  if (drawerTotal) drawerTotal.textContent = INR(total);
}

// Called by inline Remove buttons in the drawer
window.removeFromDrawer = function(key) {
  const updated = getCart().filter(item => getCartKey(item) !== key);
  saveCart(updated);
  renderDrawer();
  // update badge
  const badge = document.getElementById('s-cart-count') || document.getElementById('cart-count');
  if (badge) {
    const count = updated.reduce((n, i) => n + (i.quantity || 1), 0);
    badge.textContent = count;
    badge.style.display = count ? 'inline-flex' : 'none';
  }
};

// Expose so main.js and product.js can call it after adding an item
window.refreshCartDrawer = renderDrawer;

/* ── Drawer open / close wiring ── */
function openDrawer() {
  document.getElementById('cart-drawer')?.classList.add('active');
  renderDrawer();
}

function closeDrawer() {
  document.getElementById('cart-drawer')?.classList.remove('active');
}

document.getElementById('close-cart')?.addEventListener('click', closeDrawer);
document.getElementById('cart-overlay')?.addEventListener('click', closeDrawer);

// Homepage floating nav cart button (id="s-open-cart")
document.getElementById('s-open-cart')?.addEventListener('click', (e) => {
  e.preventDefault();
  openDrawer();
});

// Fallback: any other open-cart trigger
document.getElementById('open-cart')?.addEventListener('click', (e) => {
  e.preventDefault();
  openDrawer();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});
