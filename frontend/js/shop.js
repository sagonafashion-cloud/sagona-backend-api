const API = "https://sagona-backend-api.onrender.com/api/products";

async function loadProducts() {
    const res = await fetch(API);
    const data = await res.json();

    const container = document.getElementById("products");
    container.innerHTML = "";

    data.forEach(p => {
        const img = p.image || "https://picsum.photos/400/500"; // ✅ FIX placeholder error

        container.innerHTML += `
            <div class="product">
                <img src="${img}">
                <h3>${p.name}</h3>
                <p>₹${p.price}</p>
                <button onclick='addToCart(${JSON.stringify(p)})'>
                    Add to Cart
                </button>
            </div>
        `;
    });
}

function addToCart(product) {
    let cart = JSON.parse(localStorage.getItem("cart")) || [];
    cart.push(product);
    localStorage.setItem("cart", JSON.stringify(cart));
    alert("Added to cart");
}

loadProducts();