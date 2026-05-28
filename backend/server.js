import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import * as Sentry from '@sentry/node';

import { connectDB } from './config/db.js';

// ── Customer routes ────────────────────────────────────────
import authRoutes        from './routes/authRoutes.js';
import productRoutes     from './routes/productRoutes.js';
import orderRoutes       from './routes/orderRoutes.js';
import paymentRoutes     from './routes/paymentRoutes.js';
import storeRoutes       from './routes/storeRoutes.js';
import deliveryRoutes    from './routes/deliveryRoutes.js';
import chatRoutes        from './routes/chatRoutes.js';
import sitemapRoutes     from './routes/sitemapRoutes.js';
import supportRoutes     from './routes/supportRoutes.js';

// ── Admin routes ───────────────────────────────────────────
import adminAuthRoutes    from './routes/adminAuthRoutes.js';
import adminProductRoutes from './routes/adminProductRoutes.js';
import adminOrderRoutes   from './routes/adminOrderRoutes.js';
import analyticsRoutes    from './routes/analyticsRoutes.js';
import uploadRoutes       from './routes/uploadRoutes.js';
import gstRoutes          from './routes/gstRoutes.js';
import { adminChat }      from './controllers/chatController.js';
import { adminProtect }  from './middleware/adminAuth.js';
import homepageRoutes    from './routes/homepageRoutes.js';

// ── Controllers (needed for raw-body webhook) ──────────────
import { razorpayWebhook } from './controllers/paymentController.js';

// ── Error middleware ───────────────────────────────────────
import { notFound, errorHandler } from './middleware/errorMiddleware.js';

dotenv.config();

// ── Sentry (init before everything else) ──────────────────
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.2
  });
}

connectDB();

const app = express();

// ── Rate limiters ──────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
});

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id || req.ip,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

// ── Razorpay webhook: raw body BEFORE express.json() ──────
app.post(
  '/api/payment/webhook',
  express.raw({ type: 'application/json' }),
  razorpayWebhook
);

// ── Sentry request handler (before other middleware) ───────
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler());
}

// ── CORS ───────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    // Allow Expo Go dev scheme
    if (origin.startsWith('exp://') || origin.startsWith('exps://')) return callback(null, true);
    if (ALLOWED_ORIGINS.some((o) => origin === o)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing ───────────────────────────────────────────
app.use(express.json());

// ── Input sanitisation ─────────────────────────────────────
app.use(mongoSanitize());   // strips $ and . from user input → prevents NoSQL injection
app.use(hpp());             // prevents HTTP parameter pollution

// ── Helmet with CSP ───────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com',
                    'https://www.googletagmanager.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'https://res.cloudinary.com',
                    'https://images.unsplash.com'],
      connectSrc:  ["'self'", 'https://api.anthropic.com', 'https://exp.host'],
      frameSrc:    ['https://api.razorpay.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(morgan('dev'));

// ── Route-specific rate limits (applied before routes) ────
app.use('/api/auth',  authLimiter);
app.use('/api/admin', adminLimiter);
app.use('/api/chat',  chatLimiter);
app.use('/api',       apiLimiter);

// ── Health check ───────────────────────────────────────────
app.get('/', (_req, res) => res.json({ message: 'SAGONA API Running', version: '2.0.0' }));

app.get('/api/health', (_req, res) => {
  const state = mongoose.connection.readyState;
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][state];
  res.status(state === 1 ? 200 : 503).json({
    status: state === 1 ? 'ok' : 'degraded',
    db: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + 's',
  });
});

// ── Customer API ───────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/payment',  paymentRoutes);
app.use('/api/stores',   storeRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/chat',     chatRoutes);
app.use('/api/support',  supportRoutes);

// ── Admin API ──────────────────────────────────────────────
app.use('/api/admin/auth',      adminAuthRoutes);
app.use('/api/admin/products',  adminProductRoutes);
app.use('/api/admin/orders',    adminOrderRoutes);
app.use('/api/admin/analytics', analyticsRoutes);
app.use('/api/admin/upload',    uploadRoutes);
app.use('/api/admin/gst',       gstRoutes);
app.use('/api/admin/stores',    storeRoutes);
app.use('/api',                 homepageRoutes);
app.post('/api/admin/chat',     adminProtect, adminChat);

// ── Sitemap (public, no auth) ──────────────────────────────
app.use('/', sitemapRoutes);

// ── Sentry error handler (before custom error middleware) ──
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// ── Error handling ─────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
