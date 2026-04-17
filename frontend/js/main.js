/* =========================================================
   SAGONA – MAIN JS (Single Source of Truth)
   ========================================================= */

/* ======================
   UTILITIES
   ====================== */
function getStorage(key) {
    return JSON.parse(localStorage.getItem(key)) || [];
}

function setStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

/* ======================
   INDEX – TEST ORDER
   ====================== */
document.addEventListener("DOMContentLoaded", () => {
    const orderBtn = document.getElementById("orderBtn");

    if (orderBtn) {
        orderBtn.addEventListener("click", () => {
            const cart = [
                { name: "Kids T-Shirt", price: 499 },
                { name: "Kids Jeans", price: 899 }
            ];

            const order = {
                date: new Date().toISOString(),
                cart
            };

            const previousOrders = getStorage("previousOrders");
            previousOrders.push(order);
            setStorage("previousOrders", previousOrders);

            alert("Test order placed successfully!");
        });
    }
});

/* ======================
   SHOP – ADD TO CART
   ====================== */
document.addEventListener("DOMContentLoaded", () => {
    const addBtn = document.getElementById("addBtn");

    if (addBtn) {
        addBtn.addEventListener("click", () => {
            const cart = getStorage("cart");

            cart.push({
                id: Date.now(),
                name: "Luxury Kids Dress",
                price: 999
            });

            setStorage("cart", cart);
            alert("Added to cart");
        });
    }
});

/* ======================
   SHOP – ADD TO WISHLIST
   ====================== */
document.addEventListener("DOMContentLoaded", () => {
    const wishlistBtn = document.getElementById("wishlistBtn");

    if (wishlistBtn) {
        wishlistBtn.addEventListener("click", () => {
            const wishlist = getStorage("wishlist");

            wishlist.push({
                id: Date.now(),
                name: "Luxury Kids Dress",
                price: 999
            });

            setStorage("wishlist", wishlist);
            alert("Added to wishlist");
            loadWishlist();
        });
    }
});

/* ======================
   WISHLIST – RENDER
   ====================== */
function loadWishlist() {
    const container = document.getElementById("wishlistItems");
    const emptyMsg = document.getElementById("emptyWishlist");

    if (!container) return;

    const wishlist = getStorage("wishlist");
    container.innerHTML = "";

    if (wishlist.length === 0) {
        if (emptyMsg) emptyMsg.style.display = "block";
        return;
    }

    if (emptyMsg) emptyMsg.style.display = "none";

    wishlist.forEach((item, index) => {
        const card = document.createElement("div");
        card.className = "wishlist-card";

        card.innerHTML = `
            <h3>${item.name}</h3>
            <p class="price luxury">₹${item.price}</p>
            <div class="wishlist-actions">
                <button onclick="moveToCart(${index})">Move to Cart</button>
                <button onclick="removeFromWishlist(${index})">Remove</button>
            </div>
        `;

        container.appendChild(card);
    });
}

function removeFromWishlist(index) {
    const wishlist = getStorage("wishlist");
    wishlist.splice(index, 1);
    setStorage("wishlist", wishlist);
    loadWishlist();
}

function moveToCart(index) {
    const wishlist = getStorage("wishlist");
    const cart = getStorage("cart");

    cart.push(wishlist[index]);
    wishlist.splice(index, 1);

    setStorage("cart", cart);
    setStorage("wishlist", wishlist);

    alert("Item moved to cart");
    loadWishlist();
}

/* ======================
   CART – RENDER
   ====================== */
function renderCart() {
    const cart = getStorage("cart");

    const cartItems = document.getElementById("cart-items");
    const emptyCart = document.getElementById("empty-cart");
    const totalEl = document.getElementById("cart-total");
    const loyaltyEl = document.getElementById("loyaltyPoints");

    if (!cartItems || !totalEl) return;

    cartItems.innerHTML = "";

    if (cart.length === 0) {
        if (emptyCart) emptyCart.style.display = "block";
        totalEl.textContent = "0";
        if (loyaltyEl) loyaltyEl.textContent = "";
        return;
    }

    if (emptyCart) emptyCart.style.display = "none";

    let total = 0;

    cart.forEach(item => {
        total += item.price;

        const div = document.createElement("div");
        div.className = "cart-item";
        div.textContent = `${item.name} – ₹${item.price}`;
        cartItems.appendChild(div);
    });

    totalEl.textContent = total;

    if (loyaltyEl) {
        const points = Math.floor(total / 100);
        loyaltyEl.textContent = `You will earn ${points} loyalty points`;
    }
}

/* ======================
   AUTO INIT (SAFE)
   ====================== */
document.addEventListener("DOMContentLoaded", () => {
    loadWishlist();
    renderCart();
});
// ================= FADE IN ON SCROLL =================

const faders = document.querySelectorAll(".fade-in");

const appearOptions = {
    threshold: 0.2,
};

const appearOnScroll = new IntersectionObserver(function (
    entries,
    appearOnScroll
) {
    entries.forEach(entry => {
        if (!entry.isIntersecting) {
            return;
        } else {
            entry.target.classList.add("show");
            appearOnScroll.unobserve(entry.target);
        }
    });
},
    appearOptions);

faders.forEach(fader => {
    appearOnScroll.observe(fader);
});
// ================= LOAD PRODUCTS =================

async function loadProducts() {
    try {
        const res = await fetch("https://your-backend-url.com/api/products");
        const products = await res.json();

        const grid = document.getElementById("productGrid");
        grid.innerHTML = "";

        products.forEach(product => {
            grid.innerHTML += `
        <div class="product-card fade-in">
          <img src="${product.image}" alt="${product.name}">
          <h3>${product.name}</h3>
          <p>₹${product.price}</p>
          <button onclick="addToCart('${product._id}')">Add to Cart</button>
        </div>
      `;
        });

    } catch (error) {
        console.error("Error loading products:", error);
    }
}

document.addEventListener("DOMContentLoaded", loadProducts);
orderRoutes.js
