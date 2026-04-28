import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

// ROUTES
import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";

// MIDDLEWARE
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";

const app = express();

/* =========================================
   CORE MIDDLEWARE
========================================= */

// Security headers
app.use(helmet());

// Logging (dev only)
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// CORS (allow all for now – restrict in prod if needed)
app.use(cors());

// Body parser
app.use(express.json());

/* =========================================
   HEALTH CHECK
========================================= */

app.get("/", (req, res) => {
  res.json({
    message: "SAGONA API is running 🚀",
    env: process.env.NODE_ENV || "development",
  });
});

/* =========================================
   API ROUTES
========================================= */

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payment", paymentRoutes);

/* =========================================
   404 + ERROR HANDLING
========================================= */

// Not Found
app.use(notFound);

// Global Error Handler
app.use(errorHandler);

/* =========================================
   EXPORT
========================================= */

export default app;