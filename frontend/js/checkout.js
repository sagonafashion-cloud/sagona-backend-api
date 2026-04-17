/* =========================
   SAGONA – CHECKOUT ENGINE (FINAL)
   Production + Backend + Auth Ready
========================= */

const ORDER_API = "https://sagona-backend-api.onrender.com/api/orders";

document.addEventListener("DOMContentLoaded", () => {
    const placeOrderBtn = document.getElementById("placeOrder");
    if (!placeOrderBtn) return;

    placeOrderBtn.addEventListener("click", handleCheckout);
});

/* =========================
   MAIN CHECKOUT HANDLER
========================= */

async function handleCheckout() {

    /* 🔐 LOGIN PROTECTION */
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user"));

    if (!token || !user) {
        alert("Please login to continue");
        window.location.href = "login.html";
        return;
    }

    const formData = getCheckoutFormData();
    if (!formData) return;

    const cart = getCart();
    if (cart.length === 0) {
        alert("Your cart is empty.");
        return;
    }

    const pricing = calculatePricing(cart, formData);

    const order = buildOrderObject(cart, formData, pricing, user);

    /* 🔥 SEND TO BACKEND */
    try {
        const res = await fetch(ORDER_API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                userId: user.id,
                items: cart,
                total: pricing.total,
                paymentMethod: formData.paymentMethod,
                address: formData.address
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || "Order failed");
        }

        /* ✅ LOCAL + UI FLOW */
        persistOrder(order);
        finalizeCheckout(order);

    } catch (err) {
        console.error(err);
        alert("Order failed. Please try again.");
    }
}

/* =========================
   DATA HELPERS
========================= */

function getCheckoutFormData() {
    const name = getValue("parentName");
    const address = getValue("address");
    const paymentMethod = getValue("paymentMethod");
    const childBirthday = getValue("childBirthday");

    if (!name || !address || !paymentMethod) {
        alert("Please fill all required details.");
        return null;
    }

    return { name, address, paymentMethod, childBirthday };
}

function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
}

function getCart() {
    try {
        return JSON.parse(localStorage.getItem("cart")) || [];
    } catch {
        return [];
    }
}

/* =========================
   PRICING RULES
========================= */

function calculatePricing(cart, formData) {
    const subtotal = cart.reduce((sum, item) => {
        const qty = item.quantity || 1;
        return sum + item.price * qty;
    }, 0);

    const birthdayDiscount = calculateBirthdayDiscount(
        formData.childBirthday,
        formData.paymentMethod
    );

    const total = Math.max(subtotal - birthdayDiscount, 0);

    const loyaltyPoints =
        formData.paymentMethod === "ONLINE"
            ? Math.floor(total / 100)
            : 0;

    return {
        subtotal,
        birthdayDiscount,
        total,
        loyaltyPoints
    };
}

function calculateBirthdayDiscount(birthday, paymentMethod) {
    if (!birthday || paymentMethod !== "ONLINE") return 0;

    const today = new Date().toISOString().slice(5, 10);
    const birth = birthday.slice(5, 10);

    if (today === birth) {
        alert("🎂 Happy Birthday! ₹100 online discount applied.");
        return 100;
    }

    return 0;
}

/* =========================
   ORDER OBJECT (FRONTEND)
========================= */

function buildOrderObject(cart, formData, pricing, user) {
    return {
        orderId: `SAG-${Date.now()}`,
        createdAt: new Date().toISOString(),

        userId: user.id,

        customer: {
            name: formData.name,
            address: formData.address
        },

        items: cart,

        pricing: pricing,

        payment: {
            method: formData.paymentMethod,
            status:
                formData.paymentMethod === "ONLINE"
                    ? "PAID"
                    : "COD_PENDING"
        },

        loyalty: {
            pointsEarned: pricing.loyaltyPoints
        },

        status: "CONFIRMED"
    };
}

/* =========================
   POST-ORDER ACTIONS
========================= */

function persistOrder(order) {
    const previousOrders =
        JSON.parse(localStorage.getItem("previousOrders")) || [];

    previousOrders.push(order);
    localStorage.setItem("previousOrders", JSON.stringify(previousOrders));

    if (order.loyalty.pointsEarned > 0) {
        const totalPoints =
            parseInt(localStorage.getItem("loyaltyPoints")) || 0;

        localStorage.setItem(
            "loyaltyPoints",
            totalPoints + order.loyalty.pointsEarned
        );
    }

    localStorage.setItem("lastOrder", JSON.stringify(order));
}

function finalizeCheckout(order) {
    localStorage.removeItem("cart");

    alert(`Order placed successfully!\nPayment: ${order.payment.method}`);

    window.location.href = "order-success.html";
}

/* =========================
   FUTURE PAYMENT GATEWAY
========================= */

// Razorpay / Stripe will go here