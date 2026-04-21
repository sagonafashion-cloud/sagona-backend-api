const API = "https://sagona-backend-api.onrender.com/api/orders";

document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("placeOrder");
    if (btn) btn.addEventListener("click", placeOrder);
});

async function placeOrder() {

    // 🔐 LOGIN CHECK
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user"));

    if (!token || !user) {
        alert("Please login first");
        window.location.href = "login.html";
        return;
    }

    const name = document.getElementById("parentName").value.trim();
    const address = document.getElementById("address").value.trim();
    const paymentMethod = document.getElementById("paymentMethod").value;

    const cart = JSON.parse(localStorage.getItem("cart")) || [];

    if (!name || !address) {
        alert("Please fill all details");
        return;
    }

    if (!cart.length) {
        alert("Cart is empty");
        return;
    }

    const total = cart.reduce((sum, item) => {
        return sum + item.price * (item.quantity || 1);
    }, 0);

    body: JSON.stringify({
        userId: user.id,
        items: cart,
        total: pricing.total,
        paymentMethod: formData.paymentMethod,
        address: formData.address,

        // ✅ NEW CUSTOMER DATA
        customer: {
            name: user.name,
            email: user.email || "N/A",
            phone: user.phone || "N/A"
        }
    })

    try {
        const res = await fetch(API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify(orderData)
        });

        const data = await res.json();

        if (res.ok) {
            localStorage.removeItem("cart");

            alert("Order placed successfully");

            window.location.href = "order-success.html";
        } else {
            alert(data.message || "Order failed");
        }

    } catch (err) {
        console.error(err);
        alert("Server error");
    }
}