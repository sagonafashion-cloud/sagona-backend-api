const API_PRODUCTS = "https://sagona-backend-api.onrender.com/api/products";
const API_ORDERS = "https://sagona-backend-api.onrender.com/api/orders";

/* =========================
   AUTH CHECK
========================= */
const token = localStorage.getItem("token");

if (!token) {
    alert("Login required");
    window.location.href = "login.html";
}

/* =========================
   ADD PRODUCT
========================= */
async function addProduct() {
    const name = document.getElementById("name").value;
    const price = document.getElementById("price").value;
    const description = document.getElementById("description").value;
    const image = document.getElementById("image").value;

    try {
        const res = await fetch(API_PRODUCTS, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({ name, price, description, image })
        });

        const data = await res.json();

        if (res.ok) {
            alert("Product added");
            loadProducts();
        } else {
            alert(data.message);
        }

    } catch {
        alert("Error adding product");
    }
}

/* =========================
   LOAD PRODUCTS
========================= */
async function loadProducts() {
    const res = await fetch(API_PRODUCTS);
    const products = await res.json();

    const container = document.getElementById("products");

    container.innerHTML = products.map(p => `
        <div class="product-item">
            <span>${p.name} - ₹${p.price}</span>
            <button onclick="deleteProduct('${p._id}')">Delete</button>
        </div>
    `).join("");
}

/* =========================
   DELETE PRODUCT
========================= */
async function deleteProduct(id) {
    if (!confirm("Delete product?")) return;

    await fetch(`${API_PRODUCTS}/${id}`, {
        method: "DELETE",
        headers: {
            "Authorization": "Bearer " + token
        }
    });

    loadProducts();
}

/* =========================
   LOAD ORDERS 🔥
========================= */
async function loadOrders() {
    try {
        const res = await fetch(API_ORDERS, {
            headers: {
                "Authorization": "Bearer " + token
            }
        });

        const orders = await res.json();

        const container = document.getElementById("orders");

        if (!orders.length) {
            container.innerHTML = "<p>No orders yet</p>";
            return;
        }

        container.innerHTML = orders.map(o => `
            <div style="border:1px solid #ddd; padding:15px; margin-bottom:15px;">
                
                <p><strong>Order ID:</strong> ${o._id}</p>
                <p><strong>Total:</strong> ₹${o.total}</p>
                <p><strong>Payment:</strong> ${o.paymentMethod}</p>
                <p><strong>Address:</strong> ${o.address}</p>

                <p><strong>Items:</strong></p>
                <ul>
                    ${o.items.map(i => `<li>${i.name} - ₹${i.price}</li>`).join("")}
                </ul>

            </div>
        `).join("");

    } catch (err) {
        console.error(err);
        document.getElementById("orders").innerHTML =
            "<p>Error loading orders</p>";
    }
}

/* =========================
   INIT
========================= */
loadProducts();
loadOrders();