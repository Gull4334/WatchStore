// src/validators/admin.validators.js — Zod schemas for all admin routes

const { z } = require('zod');

// ── Auth ─────────────────────────────────────────────────────
const loginSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password:     z.string().min(8, 'Password must be at least 8 characters')
                              .regex(/\d/, 'Must include at least one number')
                              .regex(/[^a-zA-Z0-9]/, 'Must include at least one special character'),
});

// ── Orders ───────────────────────────────────────────────────
const ordersQuerySchema = z.object({
  status:  z.enum(['pending_payment','payment_submitted','payment_confirmed','dispatched','delivered','cancelled']).optional(),
  search:  z.string().optional(),
  source:  z.enum(['website','instagram','whatsapp','manual']).optional(),
  limit:   z.coerce.number().int().min(1).max(200).default(50),
  offset:  z.coerce.number().int().min(0).default(0),
});

const manualOrderSchema = z.object({
  customer_name:    z.string().min(3),
  whatsapp_number:  z.string().regex(/^03\d{9}$/, 'Format: 03XXXXXXXXX'),
  city:             z.string().min(2),
  address:          z.string().min(10),
  instagram_handle: z.string().optional(),
  product_id:       z.string().uuid(),
  quantity:         z.number().int().min(1),
  payment_method:   z.enum(['meezan_bank','easypaisa','jazzcash']),
  source:           z.enum(['instagram','whatsapp','manual']),
  notes:            z.string().optional(),
});

const cancelOrderSchema = z.object({
  reason: z.string().optional(),
});

// ── Payments ─────────────────────────────────────────────────
const paymentsQuerySchema = z.object({
  status: z.enum(['pending_review','verified','rejected']).optional(),
  limit:  z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const rejectPaymentSchema = z.object({
  reason: z.string().optional(),
});

// ── Shipments ────────────────────────────────────────────────
const shipmentsQuerySchema = z.object({
  status: z.enum(['ready_to_dispatch','dispatched','delivered']).optional(),
  limit:  z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const dispatchSchema = z.object({
  tcs_tracking_number:     z.string().min(5, 'Tracking number is required'),
  estimated_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional(),
  courier:                 z.enum(['tcs','leopards','trax']).default('tcs'),
});

// ── Products ─────────────────────────────────────────────────
const productsQuerySchema = z.object({
  category:  z.string().optional(),
  status:    z.enum(['active','inactive']).optional(),
  search:    z.string().optional(),
  low_stock: z.coerce.boolean().optional(),
  limit:     z.coerce.number().int().min(1).max(200).default(100),
  offset:    z.coerce.number().int().min(0).default(0),
});

const productSchema = z.object({
  name:           z.string().min(3, 'Name is required'),
  brand:          z.string().default('Casio'),
  category_id:    z.string().uuid('Invalid category_id'),
  sku:            z.string().optional(),
  price:          z.number().int().positive('Price must be positive'),
  compare_price:  z.number().int().positive().optional(),
  stock_quantity: z.number().int().min(0, 'Stock cannot be negative'),
  status:         z.enum(['active','inactive']).default('active'),
  description:    z.string().optional(),
  image_url:      z.string().url('Invalid image URL'),
  is_featured:    z.boolean().default(false),
  badge:          z.enum(['new','hot','sale','none']).default('none'),
});

// ── Categories ───────────────────────────────────────────────
const categorySchema = z.object({
  name:       z.string().min(2, 'Name is required'),
  slug:       z.string().optional(),
  image_url:  z.string().url().optional(),
  status:     z.enum(['active','inactive']).default('active'),
  sort_order: z.number().int().min(0).default(0),
});

// ── Discounts ────────────────────────────────────────────────
const discountsQuerySchema = z.object({
  status: z.enum(['active','expired','disabled']).optional(),
  limit:  z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const discountSchema = z.object({
  code:            z.string().min(2).toUpperCase(),
  discount_type:   z.enum(['percentage','fixed']),
  discount_value:  z.number().int().positive(),
  min_order_value: z.number().int().min(0).default(0),
  max_uses:        z.number().int().positive().optional(),
  expires_at:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ── Customers ────────────────────────────────────────────────
const customersQuerySchema = z.object({
  search: z.string().optional(),
  source: z.enum(['website','instagram','whatsapp','manual']).optional(),
  limit:  z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// ── Refunds ──────────────────────────────────────────────────
const refundsQuerySchema = z.object({
  status: z.enum(['pending','approved','processed','rejected']).optional(),
  limit:  z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ── Dashboard charts ─────────────────────────────────────────
const chartQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

const activityQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ── Settings ─────────────────────────────────────────────────
const settingsSchema = z.object({
  store_name:                    z.string().min(2).optional(),
  whatsapp_number:               z.string().optional(),
  instagram_handle:              z.string().optional(),
  admin_email:                   z.string().email().optional(),
  meezan_account_no:             z.string().optional(),
  meezan_iban:                   z.string().optional(),
  easypaisa_number:              z.string().optional(),
  jazzcash_number:               z.string().optional(),
  shipping_fee:                  z.number().int().min(0).optional(),
  free_shipping_threshold:       z.number().int().min(0).optional(),
  default_courier:               z.enum(['tcs','leopards','trax']).optional(),
  low_stock_threshold:           z.number().int().min(0).optional(),
  ticker_text:                   z.string().optional(),
  wa_template_order_placed:      z.string().optional(),
  wa_template_payment_confirmed: z.string().optional(),
  wa_template_payment_rejected:  z.string().optional(),
  wa_template_dispatched:        z.string().optional(),
  wa_template_delivered:         z.string().optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'At least one field must be provided' });

module.exports = {
  loginSchema, changePasswordSchema,
  ordersQuerySchema, manualOrderSchema, cancelOrderSchema,
  paymentsQuerySchema, rejectPaymentSchema,
  shipmentsQuerySchema, dispatchSchema,
  productsQuerySchema, productSchema,
  categorySchema,
  discountsQuerySchema, discountSchema,
  customersQuerySchema,
  refundsQuerySchema,
  chartQuerySchema, activityQuerySchema,
  settingsSchema,
};
