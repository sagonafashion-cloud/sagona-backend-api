import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { connectDB } from './config/db.js';

import authRoutes from "./routes/authRoutes.js";
import productRoutes from './routes/productRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
// import paymentRoutes from "./routes/paymentRoutes.js";

dotenv.config();
connectDB();

const app = express();

app.use(cors());
app.use(express.json());
app.use(helmet());
app.use(morgan('dev'));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));

app.get('/', (req, res) => res.send('SAGONA API Running'));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
// app.use("/api/payment", paymentRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
