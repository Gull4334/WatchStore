// src/validators/public.validators.js — Zod schemas for all public (frontend) routes

const { z } = require('zod');

// ── A3 / A4 ─────────────────────────────────────────────────
const productQuerySchema = z.object({
  category: z.string().optional(),
  limit:    z.coerce.number().int().min(1).max(200).default(100),
  offset:   z.coerce.number().int().min(0).default(0),
});

// ── A6 — Validate discount ───────────────────────────────────
const validateDiscountSchema = z.object({
  code:       z.string().min(1, 'Code is required').toUpperCase(),
  cart_total: z.number().int().positive('cart_total must be a positive integer'),
});

// ── A7 — Place order ─────────────────────────────────────────
const orderItemSchema = z.object({
  product_id: z.string().uuid('Invalid product_id'),
  quantity:   z.number().int().min(1, 'Quantity must be at least 1'),
  unit_price: z.number().int().positive('unit_price must be positive'),
});

const placeOrderSchema = z.object({
  customer_name:    z.string().min(3, 'Name must be at least 3 characters'),
  whatsapp_number:  z.string().regex(/^03\d{9}$/, 'WhatsApp number must be 11-digit Pakistani format: 03XXXXXXXXX'),
  email:            z.string().email().optional().or(z.literal('')),
  city:             z.string().min(2, 'City is required'),
  address:          z.string().min(10, 'Please provide a full address'),
  instagram_handle: z.string().optional(),
  order_notes:      z.string().optional(),
  payment_method:   z.enum(['meezan_bank', 'easypaisa', 'jazzcash']),
  source:           z.enum(['website', 'instagram', 'whatsapp', 'manual']).default('website'),
  discount_code:    z.string().optional(),
  items:            z.array(orderItemSchema).min(1, 'Order must have at least one item'),
  subtotal:         z.number().int().min(0),
  shipping_fee:     z.number().int().min(0),
  discount_amount:  z.number().int().min(0).default(0),
  total_amount:     z.number().int().positive(),
});

// ── A8 — Order tracking ──────────────────────────────────────
const trackOrderSchema = z.object({
  order_number: z.string().regex(/^WPK-\d{5}$/, 'Format must be WPK-XXXXX'),
});

// ── A9 — Screenshot upload (form fields alongside file) ──────
const screenshotBodySchema = z.object({
  order_id:        z.string().uuid('Invalid order_id'),
  transaction_ref: z.string().optional(),
});

module.exports = {
  productQuerySchema,
  validateDiscountSchema,
  placeOrderSchema,
  trackOrderSchema,
  screenshotBodySchema,
};
