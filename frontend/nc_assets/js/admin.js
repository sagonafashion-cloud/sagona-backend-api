import { request } from './api.js';

const token = localStorage.getItem("token");
if (!token) location.href = "login.html";

const productForm = document.getElementById("product-form");
const productsWrap = document.getElementById("admin-products");
const ordersWrap = document.getElementById("admin-orders");

let allProducts = [];

async function loadDashboard() {
  try {
    const [products, orders] = await Promise.all([
      request("/products"),
      request("/orders")
    ]);

    allProducts = products;

    /* METRICS */
    document.getElementById("total-orders").textContent = orders.length;

    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    document.getElementById("total-revenue").textContent = `₹${revenue}`;

    /* PRODUCTS */
    productsWrap.innerHTML = products.map((p) => `
      <div class="admin-card">
        <img src="${p.image}" />
        <h3>${p.name}</h3>
        <p>₹${p.price}</p>
        <button class="btn ghost delete" data-id="${p._id}">Delete</button>
      </div>
    `).join("");

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