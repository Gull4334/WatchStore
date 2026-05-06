require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Route modules
const authRoutes      = require('./modules/auth/auth.routes');
const productRoutes   = require('./modules/products/products.routes');
const orderRoutes     = require('./modules/orders/orders.routes');
const paymentRoutes   = require('./modules/payments/payments.routes');
const refundRoutes    = require('./modules/payments/refunds.routes');
const shipmentRoutes  = require('./modules/shipments/shipments.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const discountRoutes  = require('./modules/orders/discounts.routes');

// Init DB connection
require('./config/db');

const app = express();

// ── Security & Parsing ────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Global Rate Limit ─────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      200,
  message:  { success: false, message: 'Too many requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders:   false,
});
app.use(globalLimiter);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'WatchStore PK API',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
const API = '/api/v1';

app.use(`${API}/auth`,       authRoutes);
app.use(`${API}/products`,   productRoutes);
app.use(`${API}/categories`, productRoutes); // categories are inside products router
app.use(`${API}/orders`,     orderRoutes);
app.use(`${API}/payments`,   paymentRoutes);
app.use(`${API}/refunds`,    refundRoutes);
app.use(`${API}/shipments`,  shipmentRoutes);
app.use(`${API}/analytics`,  analyticsRoutes);
app.use(`${API}/discounts`,  discountRoutes);

// ── 404 & Error Handlers ──────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 WatchStore PK API running on port ${PORT} [${process.env.NODE_ENV}]`);
  console.log(`📡 Base URL: http://localhost:${PORT}/api/v1`);
});

module.exports = app;
