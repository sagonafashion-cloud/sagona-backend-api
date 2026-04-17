const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("SAGONA backend running successfully");
});

app.post("/order", (req, res) => {
    console.log("Order received:", req.body);
    res.json({ success: true });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});

