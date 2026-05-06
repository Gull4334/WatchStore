const db           = require('../../config/db');
const response     = require('../../utils/response');
const asyncHandler = require('../../utils/asyncHandler');

// GET /api/v1/discounts  (admin)
const listDiscounts = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT * FROM discount_codes ORDER BY created_at DESC`
  );
  return response.success(res, result.rows);
});

// POST /api/v1/discounts  (admin — create code)
const createDiscount = asyncHandler(async (req, res) => {
  const {
    code, type, value,
    min_order_amount = 0,
    max_uses, expires_at,
  } = req.body;

  if (!code || !type || !value) {
    return response.error(res, 'code, type, and value are required', 400);
  }

  const result = await db.query(
    `INSERT INTO discount_codes
       (code, type, value, min_order_amount, max_uses, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [code.toUpperCase(), type, value, min_order_amount,
     max_uses || null, expires_at || null]
  );

  return response.created(res, result.rows[0], 'Discount code created');
});

// PUT /api/v1/discounts/:id  (admin)
const updateDiscount = asyncHandler(async (req, res) => {
  const { id }       = req.params;
  const { is_active, expires_at, max_uses } = req.body;

  const result = await db.query(
    `UPDATE discount_codes
     SET is_active = COALESCE($1, is_active),
         expires_at = COALESCE($2, expires_at),
         max_uses = COALESCE($3, max_uses),
         updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [is_active, expires_at || null, max_uses || null, id]
  );

  if (result.rows.length === 0) return response.notFound(res, 'Discount code not found');
  return response.success(res, result.rows[0], 'Discount code updated');
});

// POST /api/v1/discounts/validate  (public — customer checks a code)
const validateDiscount = asyncHandler(async (req, res) => {
  const { code, order_subtotal } = req.body;

  if (!code) return response.error(res, 'Code is required', 400);

  const result = await db.query(
    `SELECT id, code, type, value, min_order_amount
     FROM discount_codes
     WHERE code = $1 AND is_active = true
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR used_count < max_uses)`,
    [code.toUpperCase()]
  );

  if (result.rows.length === 0) {
    return response.error(res, 'Invalid or expired discount code', 400);
  }

  const dc = result.rows[0];

  if (order_subtotal && parseFloat(order_subtotal) < parseFloat(dc.min_order_amount)) {
    return response.error(
      res,
      `Minimum order of PKR ${dc.min_order_amount} required for this code`,
      400
    );
  }

  let discount_amount = 0;
  if (order_subtotal) {
    discount_amount = dc.type === 'percentage'
      ? (parseFloat(order_subtotal) * parseFloat(dc.value)) / 100
      : Math.min(parseFloat(dc.value), parseFloat(order_subtotal));
    discount_amount = Math.round(discount_amount * 100) / 100;
  }

  return response.success(res, {
    code:            dc.code,
    type:            dc.type,
    value:           dc.value,
    discount_amount,
  }, 'Discount code is valid');
});

module.exports = { listDiscounts, createDiscount, updateDiscount, validateDiscount };
