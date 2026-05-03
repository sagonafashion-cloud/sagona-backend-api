import { request } from "./api.js";

let allProducts = [];

/* =========================
   LOAD PRODUCTS
========================= */
async function loadProducts() {
  try {
    const products = await request("/products");
    allProducts = products;

    renderFeatured(products);
    renderShop(products);

  } catch (err) {
    console.error("Error loading products:", err);
  }
}

/* =========================
   FEATURED (HOME PAGE)
========================= */
function renderFeatured(products) {
  const el = document.getElementById("featured-products");
  if (!el) return;

  const featured = products.filter(p => p.featured);

  el.innerHTML = featured.map(p => `
    <div class="card">

      <img src="${p.image}" alt="${p.name}">

      <div class="card-overlay">
        <button class="btn gold add" data-id="${p._id}">Add</button>
        <button class="btn ghost">♡</button>
      </div>

      <div class="card-body">
        <h3>${p.name}</h3>
        <p class="price">₹${p.price}</p>
      </div>

    </div>
  `).join("");
}

/* =========================
   SHOP PAGE
========================= */
function renderShop(products) {
  const grid = document.getElementById("shop-grid");
  if (!grid) return;

  grid.innerHTML = products.map(p => `
    <div class="card">

      <img src="${p.image}" alt="${p.name}">

      <div class="card-overlay">
        <button class="btn gold add" data-id="${p._id}">Add</button>
        <button class="btn ghost">♡</button>
      </div>

      <div class="card-body">
        <h3>${p.name}</h3>
        <p class="price">₹${p.price}</p>
      </div>

    </div>
  `).join("");
}

/* =========================
   FILTERS (SHOP)
========================= */
function setupFilters() {
  const search = document.getElementById("search");
  const sort = document.getElementById("sort");
  const priceRadios = document.querySelectorAll("input[name='price']");

  function applyFilters() {
    let filtered = [...allProducts];

    /* SEARCH */
    if (search?.value) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(search.value.toLowerCase())
      );
    }

    /* PRICE FILTER */
    const selectedPrice = [...priceRadios].find(r => r.checked)?.value;

    if (selectedPrice) {
      if (selectedPrice === "0-2000") {
        filtered = filtered.filter(p => p.price < 2000);
      } else if (selectedPrice === "2000-5000") {
        filtered = filtered.filter(p => p.price >= 2000 && p.price <= 5000);
      } else if (selectedPrice === "5000+") {
        filtered = filtered.filter(p => p.price > 5000);
      }
    }

    /* SORT */
    if (sort?.value === "low") {
      filtered.sort((a, b) => a.price - b.price);
    }

    if (sort?.value === "high") {
      filtered.sort((a, b) => b.price - a.price);
    }

    renderShop(filtered);
  }

  search?.addEventListener("input", applyFilters);
  sort?.addEventListener("change", applyFilters);
  priceRadios.forEach(r => r.addEventListener("change", applyFilters));
}

/* =========================
   ADD TO CART (BASIC)
========================= */
document.addEventListener("click", (e) => {
  if (!e.target.classList.contains("add")) return;

  const id = e.target.dataset.id;

  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  cart.push(id);

  localStorage.setItem("cart", JSON.stringify(cart));

  alert("Added to cart");
});

/* =========================
   INIT
========================= */
loadProducts();
setupFilters();