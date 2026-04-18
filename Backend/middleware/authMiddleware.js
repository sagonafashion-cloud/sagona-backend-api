import jwt from "jsonwebtoken";

export const protect = (req, res, next) => {
    const token = req.headers.authorization;

    if (!token) return res.status(401).json({ message: "No token" });

    try {
        const decoded = jwt.verify(token, "sagonaSecret");
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({ message: "Invalid token" });
    }
};

export const isAdmin = (req, res, next) => {
    if (req.user?.role === "admin") next();
    else res.status(403).json({ message: "Admin only" });
};