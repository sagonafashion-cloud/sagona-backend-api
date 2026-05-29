import { request }  from './api.js';
import { API_BASE } from './config.js';
import { getCart, saveCart } from './storage.js';
import { initSizingTool } from './sizing.js';

const wrap = document.querySelector('#product-view');
const id   = new URLSearchParams(location.search).get('id');

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/* ── add to cart ── */
const addToCart = (p, size, colour) => {
  const cart = getCart();
  const key  = `${p._id}_${size || ''}_${colour || ''}`;
  const item = cart.find((i) => i.key === key);
  if (item) item.quantity++;
  else cart.push({
    key,
    id: p._id,
    name: p.name,
    price: p.price,
    image: p.images?.[0] || p.image,
    size,
    colour,
    quantity: 1
  });
  saveCart(cart);

  // GA4 — add_to_cart
  window._gtag?.('event', 'add_to_cart', {
    currency: 'INR',
    value:    p.price,
    items: [{ item_id: p._id, item_name: p.name, item_category: p.category, price: p.price, quantity: 1 }]
  });

  // open drawer if present
  document.getElementById('cart-drawer')?.classList.add('active');
  if (window.refreshCartDrawer) window.refreshCartDrawer();
};

/* ── accordion logic ── */
function initAccordions() {
  document.querySelectorAll('.accordion-header').forEach((header) => {
    header.addEventListener('click', () => {
      const item = header.closest('.accordion-item');
      item.classList.toggle('open');
    });
  });
}

/* ── pincode checker ── */
async function checkPincode(pincode) {
  const resultEl = document.getElementById('delivery-result');
  if (!pincode || !/^\d{6}$/.test(pincode)) {
    resultEl.className = 'delivery-result err';
    resultEl.textContent = 'Please enter a valid 6-digit pincode.';
    resultEl.style.display = 'block';
    return;
  }
  resultEl.textContent = 'Checking…';
  resultEl.className = 'delivery-result';
  resultEl.style.display = 'block';

  try {
    const res = await fetch(`${API_BASE}/delivery/check`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pincode })
    });
    const data = await res.json();
    if (data.success && data.data?.available) {
      const d = data.data;
      resultEl.className = 'delivery-result ok';
      resultEl.textContent = `✓ Delivery available · Estimated ${d.etaDays} business days${d.codAvailable ? ' · COD available' : ''}`;
    } else {
      resultEl.className = 'delivery-result err';
      resultEl.textContent = 'Delivery not available at this pincode.';
    }
  } catch {
    resultEl.className = 'delivery-result err';
    resultEl.textContent = 'Could not check delivery. Please try again.';
  }
}

/* ── main ── */
(async () => {
  if (!id) {
    wrap.innerHTML = '<p style="padding:60px 0;color:var(--gray)">Product not found.</p>';
    return;
  }

  wrap.innerHTML = '<p style="padding:60px 0;text-align:center;color:var(--gray)">Loading…</p>';

  const raw = await request(`/products/${id}`);
  // API returns { success: true, data: {...product} } — extract the product
  const p = raw?.data || raw;
  if (!p || !p._id) {
    wrap.innerHTML = '<p style="padding:60px 0;color:var(--gray)">Product not found.</p>';
    return;
  }

  // Image array — use `images` (new field) with fallback to `image`
  const images = (p.images?.length ? p.images : [p.image, p.image]).filter(Boolean);
  if (!images.length) images.push('https://via.placeholder.com/600x800?text=SAGONA');

  // Unique sizes from variants
  const sizes = [...new Set((p.variants || []).map((v) => v.size).filter(Boolean))];
  const hasSizes = sizes.length > 0;

  // Price line
  const mrpHtml = p.mrp && p.mrp > p.price
    ? `<span class="pdp-mrp">${INR(p.mrp)}</span>` : '';

  // Meta line
  const metaParts = [p.category, p.ageGroup, p.gender].filter(Boolean);
  const metaHtml  = metaParts.length
    ? `<p class="pdp-meta">${metaParts.join(' · ')}</p>` : '';

  // Accordion sections
  const accordionItems = [
    { title: 'Description',       body: p.description || 'No description available.' },
    { title: 'Fabric & Material', body: p.fabric       || 'Premium quality fabric.' },
    { title: 'Care Instructions', body: p.careInstructions || 'Hand wash recommended. Do not bleach.' },
    { title: 'Delivery & Returns', body: 'Free delivery on orders above ₹999. Easy 7-day returns on unused items in original packaging.' }
  ];

  wrap.innerHTML = `
    <div class="pdp">

      <!-- GALLERY -->
      <div class="pdp-gallery">
        <img src="${images[0]}" class="main-img" id="main-img" alt="${p.name}">
        ${images.length > 1 ? `
        <div class="pdp-thumbs">
          ${images.map((img, i) => `
            <img src="${img}" alt="${p.name}" class="${i === 0 ? 'active' : ''}" data-thumb="${img}">
          `).join('')}
        </div>` : ''}
      </div>

      <!-- INFO -->
      <div class="pdp-info">

        <h1>${p.name}</h1>
        ${metaHtml}
        <p class="pdp-price">${INR(p.price)} ${mrpHtml}</p>

        ${hasSizes ? `
        <div class="size-label">Select Size</div>
        <div class="size-options">
          ${sizes.map((s) => `<button class="size-btn" data-size="${s}">${s}</button>`).join('')}
        </div>` : ''}

        <button id="add-btn" class="btn gold">Add to Bag</button>
        <button id="wish-btn" class="btn ghost" style="width:100%;margin-bottom:24px;">♡ Save to Wishlist</button>

        <!-- PINCODE CHECKER -->
        <p class="size-label">Check Delivery</p>
        <div class="pincode-row">
          <input id="pincode-input" type="text" maxlength="6" placeholder="Enter 6-digit pincode" inputmode="numeric">
          <button id="pincode-btn">Check</button>
        </div>
        <div id="delivery-result" class="delivery-result"></div>

        <!-- ACCORDION -->
        <div class="accordion">
          ${accordionItems.map(({ title, body }) => `
          <div class="accordion-item">
            <div class="accordion-header">
              <span>${title}</span>
              <i class="accordion-icon">+</i>
            </div>
            <div class="accordion-body">${body}</div>
          </div>`).join('')}
        </div>

      </div>
    </div>
  `;

  /* ── events ── */
  let selectedSize   = sizes[0] || null;
  let selectedColour = null;

  // thumbnail click
  document.querySelectorAll('.pdp-thumbs img').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      document.getElementById('main-img').src = thumb.dataset.thumb;
      document.querySelectorAll('.pdp-thumbs img').forEach((t) => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });

  // size selection
  document.querySelectorAll('.size-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSize = btn.dataset.size;
    });
  });
  // pre-select first size
  document.querySelector('.size-btn')?.classList.add('active');

  // add to bag
  document.getElementById('add-btn').addEventListener('click', () => {
    if (hasSizes && !selectedSize) {
      document.querySelector('.size-options').style.outline = '2px solid var(--gold)';
      return;
    }
    addToCart(p, selectedSize, selectedColour);
  });

  // wishlist
  document.getElementById('wish-btn').addEventListener('click', () => {
    const { getWishlist, saveWishlist } = window.__storage || {};
    // fallback inline wishlist logic
    try {
      const wl = JSON.parse(localStorage.getItem('wishlist') || '[]');
      if (!wl.some((i) => i.id === p._id)) {
        wl.push({ id: p._id, name: p.name, price: p.price, image: images[0] });
        localStorage.setItem('wishlist', JSON.stringify(wl));
      }
      document.getElementById('wish-btn').textContent = '♥ Saved';
    } catch {}
  });

  // pincode check
  document.getElementById('pincode-btn').addEventListener('click', () => {
    checkPincode(document.getElementById('pincode-input').value.trim());
  });
  document.getElementById('pincode-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkPincode(e.target.value.trim());
  });

  // accordions
  initAccordions();

  // AI size recommendation — shows button only when garment measurements exist
  initSizingTool(p._id, !!(p.garmentMeasurements?.length));

  // update page title
  document.title = `${p.name} | SAGONA`;

  // GA4 — view_item
  window._gtag?.('event', 'view_item', {
    currency: 'INR',
    value:    p.price,
    items: [{ item_id: p._id, item_name: p.name, item_category: p.category, price: p.price }]
  });

  // Product structured data (helps Google show price/availability in search)
  const schema = {
    '@context': 'https://schema.org/',
    '@type':    'Product',
    name:       p.name,
    image:      images,
    description: p.description,
    sku:        p.sku,
    brand:      { '@type': 'Brand', name: 'Sagona' },
    offers: {
      '@type':        'Offer',
      url:            window.location.href,
      priceCurrency:  'INR',
      price:          p.price,
      availability:   p.status === 'active'
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller:         { '@type': 'Organization', name: 'Sagona' }
    }
  };
  const sd = document.createElement('script');
  sd.type = 'application/ld+json';
  sd.text = JSON.stringify(schema);
  document.head.appendChild(sd);

  // Update OG tags with real product data
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${p.name} | SAGONA`);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', p.description || '');
  if (images[0]) {
    document.querySelector('meta[property="og:image"]')?.setAttribute('content', images[0]);
    document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', images[0]);
  }
})();
