const API = "https://sagona-backend-api.onrender.com/api/products";

async function loadProducts() {
    try {
        const res = await fetch(API);
        const products = await res.json();

        const grid = document.getElementById("productGrid");

        if (!products.length) {
            grid.innerHTML = "<p>No products available</p>";
            return;
        }

        grid.innerHTML = products.map(p => `
            <div class="product-card">
                <img src="${p.image || 'https://via.placeholder.com/300'}" />
                <h3>${p.name}</h3>
                <p>₹${p.price}</p>
                <p>${p.description || ""}</p>
                <button onclick="addToCart('${p._id}', '${p.name}', ${p.price})">
                    Add to Cart
                </button>
            </div>
        `).join("");

    } catch (err) {
        console.error(err);
        document.getElementById("productGrid").innerHTML =
            "<p>Error loading products</p>";
    }
}

function addToCart(id, name, price) {
    const cart = JSON.parse(localStorage.getItem("cart")) || [];

    cart.push({ id, name, price, quantity: 1 });

    localStorage.setItem("cart", JSON.stringify(cart));

    alert("Added to cart");
}

loadProducts();