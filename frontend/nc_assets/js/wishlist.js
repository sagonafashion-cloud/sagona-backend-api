import { getWishlist, saveWishlist, getCart, saveCart } from './storage.js';
import { API_BASE } from './config.js';

const list = document.querySelector('#wishlist-list');

/* ══════════════════════════════════════════
   RENDER
══════════════════════════════════════════ */
function renderWishlist() {
  if (!list) return;

  const wishlist = getWishlist();

  if (!wishlist.length) {
    list.innerHTML = `
      <p style="text-align:center;padding:60px 0;color:#888;font-size:14px">
        Your wishlist is empty.
        <a href="shop.html" style="color:#C9A84C;text-decoration:none"> Browse products →</a>
      </p>`;
    return;
  }

  list.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:2px;background:#E8E5E0">
      ${wishlist.map((item, index) => {
        const img = item.images?.[0] || item.image || '';
        const hasDiscount = item.mrp && item.mrp > item.price;
        return `
          <div style="background:#fff;cursor:pointer" onclick="location.href='product.html?id=${item.id || item._id}'">
            <div style="aspect-ratio:3/4;overflow:hidden;background:#F8F6F3;position:relative">
              ${img
                ? `<img src="${img}" alt="${item.name}"
                        style="width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.5s ease"
                        loading="lazy"
                        onmouseover="this.style.transform='scale(1.04)'"
                        onmouseout="this.style.transform='scale(1)'"
                        onerror="this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:12px\\'>SAGONA</div>'">`
                : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:12px">SAGONA</div>'
              }
            </div>
            <div style="padding:12px 0 20px">
              <div style="font-size:13px;font-weight:500;color:#0A0A0A;margin-bottom:4px">${item.name}</div>
              <div style="font-size:13px;color:#555">
                ₹${Number(item.price).toLocaleString('en-IN')}
                ${hasDiscount ? `<span style="text-decoration:line-through;color:#999;margin-left:6px;font-size:12px">₹${Number(item.mrp).toLocaleString('en-IN')}</span>` : ''}
              </div>
              <div style="display:flex;gap:8px;margin-top:12px">
                <button onclick="event.stopPropagation();moveToCart(${index})"
                        style="flex:1;padding:9px;background:#C9A84C;color:#fff;border:none;cursor:pointer;font-size:11px;letter-spacing:0.08em;font-family:inherit">
                  MOVE TO BAG
                </button>
                <button onclick="event.stopPropagation();removeFromWishlist(${index})"
                        style="padding:9px 14px;border:0.5px solid #E8E5E0;background:transparent;cursor:pointer;font-size:11px;letter-spacing:0.08em;font-family:inherit">
                  REMOVE
                </button>
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

/* ══════════════════════════════════════════
   ACTIONS (called from inline onclick)
══════════════════════════════════════════ */
window.moveToCart = function(index) {
  const wishlist = getWishlist();
  const item = wishlist[index];
  if (!item) return;

  const cart = getCart();
  const cartKey = `${item.id || item._id}_${item.size || ''}_${item.colour || ''}`;
  const existing = cart.find(c => (c.key || `${c.id || c._id}_${c.size || ''}_${c.colour || ''}`) === cartKey);

  if (existing) {
    existing.quantity = (existing.quantity || 1) + 1;
  } else {
    cart.push({
      key:      cartKey,
      id:       item.id || item._id,
      name:     item.name,
      price:    item.price,
      image:    item.images?.[0] || item.image || '',
      size:     item.size   || undefined,
      colour:   item.colour || undefined,
      quantity: 1
    });
  }

  wishlist.splice(index, 1);
  saveCart(cart);
  saveWishlist(wishlist);
  renderWishlist();
};

window.removeFromWishlist = function(index) {
  const wishlist = getWishlist();
  wishlist.splice(index, 1);
  saveWishlist(wishlist);
  renderWishlist();
};

/* ══════════════════════════════════════════
   REFRESH IMAGES — fixes items saved without image
══════════════════════════════════════════ */
async function refreshWishlistImages() {
  const wishlist = getWishlist();
  const missing = wishlist.filter(i => !i.image && !(i.images?.length));
  if (!missing.length) return;

  for (const item of missing) {
    try {
      const res  = await fetch(`${API_BASE}/products/${item.id || item._id}`);
      const json = await res.json();
      const data = json.data || json;
      if (data && (data.images?.length || data.image)) {
        item.image  = data.images?.[0] || data.image || '';
        item.images = data.images || [];
        item.mrp    = data.mrp || item.mrp;
      }
    } catch {}
  }

  saveWishlist(wishlist);
  renderWishlist();
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
renderWishlist();
refreshWishlistImages();
