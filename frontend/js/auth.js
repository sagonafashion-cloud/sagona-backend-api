const API = "https://sagona-backend-api.onrender.com/api";

/* =========================
   REGISTER
========================= */
async function register() {
    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

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
            alert("Registered successfully");
            window.location.href = "login.html";
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert("Registration failed");
        console.error(err);
    }
}

/* =========================
   LOGIN
========================= */
async function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
        const res = await fetch(`${API}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (res.ok) {
            // ✅ Store token
            localStorage.setItem("token", data.token);

            // Optional user info
            localStorage.setItem("user", JSON.stringify({
                name: data.name,
                id: data.id
            }));

            alert("Login successful");

            window.location.href = "admin.html";
        } else {
            alert(data.message);
        }

    } catch (err) {
        alert("Login failed");
        console.error(err);
    }
}