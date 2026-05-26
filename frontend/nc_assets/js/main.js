import { API_BASE } from './config.js';
import { getCart, getToken, getUser } from './storage.js';

// ── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  initMenu();
  initCartDrawerTrigger();
  updateCartBadge();
  updateAuthNav();
  await loadHomepageSections();
  initScrollAnimations();
  initVideoIntersection();
});

// ── FLOATING NAV colour shift on scroll ────────────────────
function initNav() {
  const nav = document.getElementById('s-nav');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > window.innerHeight * 0.85);
  }, { passive: true });
}

// ── HAMBURGER MENU ──────────────────────────────────────────
function initMenu() {
  const drawer  = document.getElementById('s-menu-drawer');
  const overlay = document.getElementById('s-menu-overlay');
  const openBtn = document.getElementById('s-open-menu');
  const closeBtn = document.getElementById('s-close-menu');
  if (!drawer) return;

  function open()  { drawer.classList.add('open'); overlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function close() { drawer.classList.remove('open'); overlay.classList.remove('open'); document.body.style.overflow = ''; }

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
}

// ── CART BADGE ──────────────────────────────────────────────
function updateCartBadge() {
  const badge = document.getElementById('s-cart-count');
  if (!badge) return;
  const count = getCart().reduce((n, i) => n + (i.quantity || 1), 0);
  badge.textContent = count;
  badge.style.display = count ? 'inline-flex' : 'none';
}

function initCartDrawerTrigger() {
  // Drawer open is handled by cart.js (which also defines window.refreshCartDrawer)
  // Nothing to wire here — kept for future extension
}

// ── AUTH NAV ─────────────────────────────────────────────────
function updateAuthNav() {
  const link = document.getElementById('s-auth-link');
  if (!link) return;
  if (getToken()) {
    link.textContent = 'ACCOUNT';
    link.href = 'account.html';
  }
}

// ── LOAD HOMEPAGE SECTIONS FROM API ────────────────────────
async function loadHomepageSections() {
  const page = document.getElementById('s-page');
  if (!page) return;

  try {
    const res = await fetch(`${API_BASE}/homepage/sections`);
    const json = await res.json();
    const data = json.data;

    page.innerHTML = '';

    if (!data || !data.length) {
      page.innerHTML = buildDefaultHero();
      return;
    }

    data.forEach(section => {
      const el = buildSection(section);
      if (el) page.appendChild(el);
    });

  } catch (err) {
    console.error('Homepage sections error:', err);
    const page = document.getElementById('s-page');
    if (page) page.innerHTML = buildDefaultHero();
  }
}

// ── BUILD SECTION ────────────────────────────────────────────
function buildSection(s) {
  const div = document.createElement('section');
  div.className = 's-section';
  div.dataset.type = s.type;
  div.dataset.pos  = s.textPosition || 'bottom-left';
  div.dataset.id   = s._id;

  switch (s.type) {
    case 'hero':
    case 'editorial':
    case 'feature':
      div.innerHTML = buildMediaSection(s);
      break;
    case 'strip':
      div.innerHTML = `<div class="s-strip-text">${s.text || 'SAGONA — NEW COLLECTION'}</div>`;
      break;
    case 'split':
      div.innerHTML = buildSplitSection(s);
      break;
    case 'products':
      div.innerHTML = buildProductsSection(s);
      fetchAndRenderProducts(div, s);
      break;
    default:
      return null;
  }

  return div;
}

// ── MEDIA SECTION (hero / editorial / feature) ───────────────
function buildMediaSection(s) {
  const overlayClass = s.overlay || 'default';
  return `
    <div class="s-media-wrap">${buildMedia(s)}</div>
    <div class="s-overlay ${overlayClass}"></div>
    ${buildContent(s)}
  `;
}

// ── SPLIT SECTION ─────────────────────────────────────────────
function buildSplitSection(s) {
  return `
    <div class="s-split-col">
      <div class="s-media-wrap split-col">${buildMediaItem(s.leftMedia)}</div>
      ${s.leftMedia?.text ? `<div class="s-content">
        <div class="s-content-label">${s.leftMedia.label || ''}</div>
        <div class="s-content-title">${s.leftMedia.text}</div>
        ${s.leftMedia.cta ? `<a href="${s.leftMedia.ctaLink || 'shop.html'}" class="s-cta">${s.leftMedia.cta}</a>` : ''}
      </div>` : ''}
    </div>
    <div class="s-split-col">
      <div class="s-media-wrap split-col">${buildMediaItem(s.rightMedia)}</div>
      ${s.rightMedia?.text ? `<div class="s-content">
        <div class="s-content-label">${s.rightMedia.label || ''}</div>
        <div class="s-content-title">${s.rightMedia.text}</div>
        ${s.rightMedia.cta ? `<a href="${s.rightMedia.ctaLink || 'shop.html'}" class="s-cta">${s.rightMedia.cta}</a>` : ''}
      </div>` : ''}
    </div>
  `;
}

// ── PRODUCTS SECTION ─────────────────────────────────────────
function buildProductsSection(s) {
  return `
    <div class="s-products-header">
      <div class="s-products-title">${s.title || 'NEW ARRIVALS'}</div>
      <a href="${s.viewAllLink || 'shop.html'}" class="s-products-viewall">VIEW ALL &#8594;</a>
    </div>
    <div class="s-products-grid" id="pgrid-${s._id}">
      ${Array(4).fill('<div class="s-product-card"><div class="s-product-img" style="background:#F0EDE8"></div></div>').join('')}
    </div>
  `;
}

async function fetchAndRenderProducts(container, s) {
  try {
    const params = new URLSearchParams({ status: 'active', limit: s.limit || 8 });
    if (s.category) params.set('category', s.category);
    if (s.featured)  params.set('featured', 'true');
    const res  = await fetch(`${API_BASE}/products?${params}`);
    const json = await res.json();
    const grid = container.querySelector(`#pgrid-${s._id}`);
    if (!grid || !json.data?.length) return;
    grid.innerHTML = json.data.map(p => buildProductCard(p)).join('');
  } catch (err) {
    console.error('Products fetch error:', err);
  }
}

function buildProductCard(p) {
  const img1 = p.images?.[0] || p.image || '';
  const img2 = p.images?.[1] || img1;
  const hasDiscount = p.mrp && p.mrp > p.price;
  return `
    <div class="s-product-card" onclick="location.href='product.html?id=${p._id}'">
      <div class="s-product-img">
        ${img1 ? `<img class="img-primary" src="${img1}" alt="${p.name}" loading="lazy">` : ''}
        ${img2 && img2 !== img1 ? `<img class="img-hover" src="${img2}" alt="${p.name}" loading="lazy">` : ''}
      </div>
      <div class="s-product-info">
        <div class="s-product-name">${p.name}</div>
        <div class="s-product-price">
          &#8377;${Number(p.price).toLocaleString('en-IN')}
          ${hasDiscount ? `<span class="s-product-mrp">&#8377;${Number(p.mrp).toLocaleString('en-IN')}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

// ── MEDIA HELPERS ─────────────────────────────────────────────
function buildMedia(s) {
  if (s.mediaType === 'video' && s.mediaUrl) {
    return `<video src="${s.mediaUrl}" autoplay muted loop playsinline preload="metadata" poster="${s.posterUrl || ''}"></video>`;
  }
  if (s.mediaUrl) {
    return `<img src="${s.mediaUrl}" alt="${s.title || 'Sagona'}" loading="${s.type === 'hero' ? 'eager' : 'lazy'}">`;
  }
  return '<div style="width:100%;height:100%;background:#0A0A0A"></div>';
}

function buildMediaItem(m) {
  if (!m) return '<div style="width:100%;height:100%;background:#F8F6F3"></div>';
  if (m.type === 'video' && m.url) {
    return `<video src="${m.url}" autoplay muted loop playsinline preload="metadata" poster="${m.poster || ''}"></video>`;
  }
  if (m.url) return `<img src="${m.url}" alt="${m.text || ''}" loading="lazy">`;
  return '<div style="width:100%;height:100%;background:#F8F6F3"></div>';
}

function buildContent(s) {
  if (!s.title && !s.subtitle && !s.cta) return '';
  const textClass = s.textColor === 'dark' ? 'dark-text' : '';
  const ctaClass  = s.textColor === 'dark' ? 'dark' : '';
  return `
    <div class="s-content ${textClass}">
      ${s.label    ? `<div class="s-content-label">${s.label}</div>` : ''}
      ${s.title    ? `<div class="s-content-title">${s.title}</div>` : ''}
      ${s.subtitle ? `<div class="s-content-sub">${s.subtitle}</div>` : ''}
      ${s.cta      ? `<a href="${s.ctaLink || 'shop.html'}" class="s-cta ${ctaClass}">${s.cta}</a>` : ''}
    </div>
  `;
}

// ── FALLBACK HERO ────────────────────────────────────────────
function buildDefaultHero() {
  return `
    <section class="s-section visible" data-type="hero" data-pos="bottom-left">
      <div class="s-media-wrap">
        <div style="width:100%;height:100%;background:linear-gradient(135deg,#0A0A0A 0%,#1a1a1a 100%)"></div>
      </div>
      <div class="s-overlay default"></div>
      <div class="s-content">
        <div class="s-content-label">NEW COLLECTION · 2026</div>
        <div class="s-content-title">Luxury Kidswear<br>for Modern Families</div>
        <a href="shop.html" class="s-cta">EXPLORE COLLECTION</a>
      </div>
    </section>
  `;
}

// ── SCROLL ANIMATIONS ────────────────────────────────────────
function initScrollAnimations() {
  const sections = document.querySelectorAll('.s-section');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.08 });
  sections.forEach(s => observer.observe(s));
}

// ── VIDEO: play when in view, pause when out ─────────────────
function initVideoIntersection() {
  const videos = document.querySelectorAll('.s-section video');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause();
    });
  }, { threshold: 0.3 });
  videos.forEach(v => observer.observe(v));
}
