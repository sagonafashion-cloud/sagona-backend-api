const API = "https://sagona-backend-api.onrender.com/api";

// ✅ ADD PRODUCT
async function addProduct() {
    const token = localStorage.getItem("token");

    if (!token) {
        alert("Login required");
        window.location.href = "login.html";
        return;
    }

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

    if (res.ok) {
        alert("Product added");
        loadProducts();
    } else {
        alert(data.message);
    }
}

// ✅ LOAD PRODUCTS
async function loadProducts() {
    const res = await fetch(`${API}/products`);
    const products = await res.json();

    const container = document.getElementById("products");
    if (!container) return;

    container.innerHTML = "";

    products.forEach(p => {
        container.innerHTML += `
            <div class="product-item">
                <span>${p.name} - ₹${p.price}</span>
            </div>
        `;
    });
}

// ✅ LOAD ORDERS (FIXED)
async function loadOrders() {
    const token = localStorage.getItem("token");

    if (!token) {
        console.log("No token found");
        return;
    }

    const res = await fetch(`${API}/orders`, {
        headers: {
            Authorization: "Bearer " + token
        }
    });

    const data = await res.json();

    const container = document.getElementById("orders");

    if (!container) {
        console.log("Orders container missing");
        return;
    }

    container.innerHTML = "";

    if (!res.ok) {
        container.innerHTML = "Error loading orders";
        console.log(data);
        return;
    }

    data.forEach(order => {
        container.innerHTML += `
            <div class="product-item">
                <span>Order: ₹${order.total}</span>
            </div>
        `;
    });
}

// ✅ INIT
window.onload = () => {
    loadProducts();
    loadOrders();
};