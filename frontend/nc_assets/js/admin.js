const API = "https://your-backend.onrender.com/api";

/* ================= ADD PRODUCT ================= */
async function addProduct() {

    const token = localStorage.getItem("token");

    const name = document.getElementById("name").value;
    const price = document.getElementById("price").value;
    const image = document.getElementById("image").value;

    const res = await fetch(`${API}/products`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ name, price, image })
    });

    alert("Product Added");
}

/* ================= LOAD ORDERS ================= */
async function loadOrders() {

    const token = localStorage.getItem("token");

    const res = await fetch(`${API}/orders`, {
        headers: {
            "Authorization": `Bearer ${token}`
        }
    });

    const data = await res.json();

    const container = document.getElementById("orders");
    container.innerHTML = "";

    data.forEach(o => {
        const div = document.createElement("div");
        div.innerHTML = `
            <p><b>${o._id}</b></p>
            <p>₹${o.total}</p>
            <hr>
        `;
        container.appendChild(div);
    });
}

loadOrders();
