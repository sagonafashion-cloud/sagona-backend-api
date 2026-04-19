const API = "https://sagona-backend-api.onrender.com/api";

/* =========================
   REGISTER
========================= */
async function register() {
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    try {
        const res = await fetch(`${API}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name, email, password })
        });

        const data = await res.json();

        if (res.ok) {
            document.getElementById("status").innerText = "Registered successfully";
            window.location.href = "login.html";
        } else {
            document.getElementById("status").innerText = data.message;
        }

    } catch (err) {
        document.getElementById("status").innerText = "Registration failed";
    }
}

/* =========================
   LOGIN (CRITICAL FIX)
========================= */
async function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await fetch("https://sagona-backend-api.onrender.com/api/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
        // ✅ SAVE TOKEN (CRITICAL)
        localStorage.setItem("token", data.token);

        localStorage.setItem("user", JSON.stringify({
            id: data.id,
            name: data.name
        }));

        alert("Login successful");

        window.location.href = "admin.html";
    } else {
        alert(data.message);
    }
}