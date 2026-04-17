const API = "https://your-backend.onrender.com/api/auth";

// REGISTER
const registerBtn = document.getElementById("registerBtn");
if (registerBtn)
    registerBtn.addEventListener("click", async () => {
        const name = document.getElementById("name").value;
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;

        const res = await fetch(`${API}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });

        const data = await res.json();
        alert(data.message);
        window.location.href = "login.html";
    });
localStorage.setItem("token", data.token);
localStorage.setItem("user", JSON.stringify({
    name: data.name,
    id: data.id
}));
res.json({ token, name: user.name, id: user._id });
