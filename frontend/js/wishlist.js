import { getWishlist, saveWishlist, getCart, saveCart } from './storage.js';

const list = document.querySelector('#wishlist-list');

const render = () => {
  const wishlist = getWishlist();
  if (!list) return;

  if (!wishlist.length) {
    list.innerHTML = '<p>Your wishlist is empty.</p>';
    return;
  }

  list.innerHTML = wishlist
    .map(
      (item, idx) => `
        <div class="table-row">
          <span>${item.name}</span>
          <span class="price">₹${item.price}</span>
          <button class="btn gold move" data-idx="${idx}">Move to cart</button>
          <button class="btn ghost remove" data-idx="${idx}">Remove</button>
        </div>
      `
    )
    .join('');
};

list?.addEventListener('click', (event) => {
  const idx = Number(event.target.dataset.idx);
  if (Number.isNaN(idx)) return;

  const wishlist = getWishlist();

  if (event.target.classList.contains('move')) {
    const cart = getCart();
    const item = wishlist[idx];
    const existing = cart.find((c) => c.id === item.id);

    if (existing) existing.quantity += 1;
    else cart.push({ ...item, quantity: 1 });

    wishlist.splice(idx, 1);
    saveCart(cart);
    saveWishlist(wishlist);
    render();
  }

  if (event.target.classList.contains('remove')) {
    wishlist.splice(idx, 1);
    saveWishlist(wishlist);
    render();
  }
});

render();
