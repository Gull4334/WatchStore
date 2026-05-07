// src/app.js — Express app factory (separate from server start for testability)

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const { requireAuth } = require('./middleware/auth');
const R           = require('./utils/response');

// ── Route imports ────────────────────────────────────────────
// Public routes
const publicSettingsRouter   = require('./routes/public.settings');
const publicCategoriesRouter = require('./routes/public.categories');
const publicProductsRouter   = require('./routes/public.products');
const publicOrdersRouter     = require('./routes/public.orders');
const publicPaymentsRouter   = require('./routes/public.payments');

// Admin routes
const adminAuthRouter       = require('./routes/admin.auth');
const adminDashboardRouter  = require('./routes/admin.dashboard');
const adminOrdersRouter     = require('./routes/admin.orders');
const adminPaymentsRouter   = require('./routes/admin.payments');
const adminShipmentsRouter  = require('./routes/admin.shipments');
const adminProductsRouter   = require('./routes/admin.products');
const adminCategoriesRouter = require('./routes/admin.categories');
const adminDiscountsRouter  = require('./routes/admin.discounts');
const adminCustomersRouter  = require('./routes/admin.customers');
const adminRefundsRouter    = require('./routes/admin.refunds');
const adminSettingsRouter   = require('./routes/admin.settings');

const app = express();

// ── Security & parsing middleware ────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()),
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,    // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
});

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,                      // stricter for order placement
  message: { error: { code: 'RATE_LIMITED', message: 'Too many order attempts. Please wait a few minutes.' } },
});

app.use('/api', generalLimiter);
app.use('/api/orders', checkoutLimiter);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─────────────────────────────────────────────────────────────
// PUBLIC ROUTES  (no auth required)
// ─────────────────────────────────────────────────────────────
app.use('/api/settings',    publicSettingsRouter);
app.use('/api/categories',  publicCategoriesRouter);
app.use('/api/products',    publicProductsRouter);
app.use('/api',             publicOrdersRouter);       // /api/discounts/validate, /api/orders, /api/orders/track
app.use('/api/payments',    publicPaymentsRouter);

// ─────────────────────────────────────────────────────────────
// ADMIN AUTH (no guard — login creates the token)
// ─────────────────────────────────────────────────────────────
app.use('/api/admin/auth', adminAuthRouter);

// ─────────────────────────────────────────────────────────────
// ADMIN PROTECTED ROUTES  (all require JWT)
// ─────────────────────────────────────────────────────────────
app.use('/api/admin',              requireAuth);    // global guard for everything below
app.use('/api/admin/dashboard',    adminDashboardRouter);
app.use('/api/admin/orders',       adminOrdersRouter);
app.use('/api/admin/payments',     adminPaymentsRouter);
app.use('/api/admin/shipments',    adminShipmentsRouter);
app.use('/api/admin/products',     adminProductsRouter);
app.use('/api/admin/categories',   adminCategoriesRouter);
app.use('/api/admin/discounts',    adminDiscountsRouter);
app.use('/api/admin/customers',    adminCustomersRouter);
app.use('/api/admin/refunds',      adminRefundsRouter);
app.use('/api/admin/settings',     adminSettingsRouter);

// ── 404 catch-all ────────────────────────────────────────────
app.use((_req, res) => R.notFound(res, 'Endpoint not found'));

// ── Global error handler ─────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  return R.error(res, 'An unexpected error occurred. Please try again.', 'INTERNAL_ERROR', 500);
});

module.exports = app;
