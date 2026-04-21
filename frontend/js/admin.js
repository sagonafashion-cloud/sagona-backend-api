const API = "https://sagona-backend-api.onrender.com/api";

document.addEventListener("DOMContentLoaded", () => {
    loadProducts();
    loadOrders();
});

/* =========================
   LOAD PRODUCTS
========================= */
async function loadProducts() {
    try {
        const res = await fetch(`${API}/products`);
        const products = await res.json();

        const container = document.getElementById("products");
        if (!container) return;

        container.innerHTML = "";

        products.forEach(p => {
            container.innerHTML += `
                <div class="product-item">
                    <span>${p.name} - ₹${p.price}</span>
                    <button onclick="deleteProduct('${p._id}')" class="delete-btn">Delete</button>
                </div>
            `;
        });
    } catch (err) {
        console.error("Products error:", err);
    }
}

/* =========================
   LOAD ORDERS (FIXED)
========================= */
async function loadOrders() {
    try {
        const token = localStorage.getItem("token");

        const res = await fetch(`${API}/orders`, {
            headers: {
                Authorization: "Bearer " + token
            }
        });

        const text = await res.text();

        let orders;
        try {
            orders = JSON.parse(text);
        } catch {
            console.error("❌ Not JSON:", text);
            return;
        }

        const container = document.getElementById("orders");

        if (!container) {
            console.error("❌ Orders div missing");
            return;
        }

        container.innerHTML = "";

        if (!orders.length) {
            container.innerHTML = "<p>No orders found</p>";
            return;
        }

        orders.forEach(o => {
            container.innerHTML += `
                <div style="border:1px solid #ddd; padding:10px; margin:10px 0;">
                    <p><strong>Order ID:</strong> ${o._id}</p>
                    <p><strong>Total:</strong> ₹${o.total}</p>
                    <p><strong>Payment:</strong> ${o.paymentMethod}</p>
                    <p><strong>Address:</strong> ${o.address}</p>
                </div>
            `;
        });

    } catch (err) {
        console.error("Orders error:", err);
    }
}

/* =========================
   ADD PRODUCT
========================= */
async function addProduct() {
    const token = localStorage.getItem("token");

    const product = {
        name: document.getElementById("name").value,
        price: document.getElementById("price").value,
        description: document.getElementById("description").value,
        image: document.getElementById("image").value
    };

    const res = await fetch(`${API}/products`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
        },
        body: JSON.stringify(product)
    });

    const data = await res.json();
    alert(data.message || "Product added");

    loadProducts();
}

/* =========================
   DELETE PRODUCT
========================= */
async function deleteProduct(id) {
    const token = localStorage.getItem("token");

    await fetch(`${API}/products/${id}`, {
        method: "DELETE",
        headers: {
            Authorization: "Bearer " + token
        }
    });

    loadProducts();
}