import { request } from './api.js';

const token = localStorage.getItem("token");
if (!token) location.href = "login.html";

const productForm = document.getElementById("product-form");
const productsWrap = document.getElementById("admin-products");
const ordersWrap = document.getElementById("admin-orders");

async function loadDashboard() {
  try {
    const [products, orders] = await Promise.all([
      request("/products"),
      request("/orders")
    ]);

    /* METRICS */
    document.getElementById("total-orders").textContent = orders.length;

    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    document.getElementById("total-revenue").textContent = `₹${revenue}`;

    /* PRODUCTS */
    function render(products) {
      grid.innerHTML = `
  <div class="skeleton"></div>
  <div class="skeleton"></div>
  <div class="skeleton"></div>
`;
      grid.innerHTML = products.map((p, i) => `
    <article class="card fade-in" style="animation-delay:${i * 0.05}s">

      <div onclick="openQuickView('${p._id}')">

        <img class="first" src="${p.image}" alt="${p.name}">
        <img class="second" src="${p.image}" alt="${p.name}">

      </div>

      <div class="card-overlay">
        <button class="btn gold add" data-id="${p._id}">Add</button>
        <button class="btn ghost wish" data-id="${p._id}">♡</button>
      </div>

      <div class="card-body">
        <h3>${p.name}</h3>
        <p class="price">₹${p.price}</p>
      </div>

    </article>
  `).join('');
    }

    /* ORDERS */
    ordersWrap.innerHTML = orders.map(o => `
      <div class="panel">
        <strong>${o.customer?.name || "Guest"}</strong>
        <p>${o.customer?.email || ""}</p>

        <p>Total: ₹${o.total}</p>
        <p>Status: ${o.status}</p>

        ${o.status !== "DELIVERED"
        ? `<button data-id="${o._id}" class="btn gold deliver">Mark Delivered</button>`
        : ""}
      </div>
    `).join("");

  } catch (err) {
    console.error("Dashboard error:", err);
  }
  window.openQuickView = (id) => {
    const p = allProducts.find(p => p._id === id);
    if (!p) return;

    document.getElementById("quick-body").innerHTML = `
    <div style="display:flex; gap:20px">
      <img src="${p.image}" style="width:300px">
      <div>
        <h2>${p.name}</h2>
        <p>₹${p.price}</p>
        <p>${p.description}</p>
        <button class="btn gold add" data-id="${p._id}">Add to Cart</button>
      </div>
    </div>
  `;

    document.getElementById("quick-view").style.display = "block";
  };

  window.closeQuickView = () => {
    document.getElementById("quick-view").style.display = "none";
  };
}

/* ADD PRODUCT */
productForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = Object.fromEntries(new FormData(productForm).entries());
  data.price = Number(data.price);
  data.featured = data.featured === "on";

  await request("/products", {
    method: "POST",
    body: JSON.stringify(data)
  });

  productForm.reset();
  loadDashboard();
});

/* DELETE PRODUCT */
productsWrap?.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("delete")) return;

  await request(`/products/${e.target.dataset.id}`, {
    method: "DELETE"
  });

  loadDashboard();
});

/* UPDATE ORDER */
ordersWrap?.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("deliver")) return;

  await request(`/orders/${e.target.dataset.id}`, {
    method: "PUT",
    body: JSON.stringify({ status: "DELIVERED" })
  });

  loadDashboard();
});

loadDashboard();