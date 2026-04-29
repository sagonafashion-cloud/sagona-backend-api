import { getWishlist, saveWishlist, getCart, saveCart } from './storage.js';

const list = document.querySelector('#wishlist-list');

/* =========================
   RENDER WISHLIST
========================= */
function renderWishlist() {
  if (!list) return;

  const wishlist = getWishlist();

  if (!wishlist.length) {
    list.innerHTML = '<p>Your wishlist is empty.</p>';
    return;
  }

  list.innerHTML = wishlist.map((item, index) => `
    <div class="table-row">
      <span>${item.name}</span>
      <span class="price">₹${item.price}</span>

      <div style="display:flex; gap:8px;">
        <button class="btn gold move" data-index="${index}">
          Move to Cart
        </button>

        <button class="btn ghost remove" data-index="${index}">
          Remove
        </button>
      </div>
    </div>
  `).join('');
}

/* =========================
   EVENT HANDLER
========================= */
list?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-index]');
  if (!btn) return;

  const index = Number(btn.dataset.index);
  if (Number.isNaN(index)) return;

  const wishlist = getWishlist();

  if (btn.classList.contains('move')) {
    const item = wishlist[index];
    const cart = getCart();

    const existing = cart.find(c => c.id === item.id);

    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({ ...item, quantity: 1 });
    }

    wishlist.splice(index, 1);

    saveCart(cart);
    saveWishlist(wishlist);

    alert('Moved to cart');
  }

  if (btn.classList.contains('remove')) {
    wishlist.splice(index, 1);
    saveWishlist(wishlist);
    alert('Removed from wishlist');
  }

  renderWishlist();
});

/* =========================
   INIT
========================= */
renderWishlist();