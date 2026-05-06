const db           = require('../../config/db');
const response     = require('../../utils/response');
const asyncHandler = require('../../utils/asyncHandler');

// POST /api/v1/refunds  (admin — request a refund)
const createRefund = asyncHandler(async (req, res) => {
  const { order_id, amount, reason } = req.body;

  const paymentResult = await db.query(
    `SELECT p.id, p.amount, p.status FROM payments p WHERE p.order_id = $1`,
    [order_id]
  );

  if (paymentResult.rows.length === 0) return response.notFound(res, 'Payment not found for this order');

  const payment = paymentResult.rows[0];
  if (payment.status !== 'verified') {
    return response.error(res, 'Only verified payments can be refunded', 400);
  }

  if (parseFloat(amount) > parseFloat(payment.amount)) {
    return response.error(res, 'Refund amount cannot exceed payment amount', 400);
  }

  const result = await db.query(
    `INSERT INTO refunds (payment_id, order_id, amount, reason, status)
     VALUES ($1, $2, $3, $4, 'requested')
     RETURNING *`,
    [payment.id, order_id, amount, reason]
  );

  return response.created(res, result.rows[0], 'Refund request created');
});

// GET /api/v1/refunds  (admin)
const listRefunds = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT
       r.id, r.amount, r.reason, r.status,
       r.requested_at, r.approved_at, r.processed_at,
       o.order_number,
       c.full_name, c.phone,
       u.name AS approved_by_name
     FROM refunds r
     JOIN orders o ON r.order_id = o.id
     JOIN customers c ON o.customer_id = c.id
     LEFT JOIN users u ON r.approved_by = u.id
     ORDER BY r.requested_at DESC`
  );
  return response.success(res, result.rows);
});

// PUT /api/v1/refunds/:id/approve  (admin)
const approveRefund = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    `UPDATE refunds
     SET status = 'approved', approved_by = $1, approved_at = NOW()
     WHERE id = $2 AND status = 'requested'
     RETURNING *`,
    [req.user.id, id]
  );

  if (result.rows.length === 0) {
    return response.error(res, 'Refund not found or already processed', 400);
  }

  // Mark order as refunded
  await db.query(
    `UPDATE orders SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
    [result.rows[0].order_id]
  );

  return response.success(res, result.rows[0], 'Refund approved');
});

// PUT /api/v1/refunds/:id/process  (admin — mark as physically transferred)
const processRefund = asyncHandler(async (req, res) => {
  const { id }              = req.params;
  const { gateway_refund_id } = req.body;

  const result = await db.query(
    `UPDATE refunds
     SET status = 'processed', gateway_refund_id = $1, processed_at = NOW()
     WHERE id = $2 AND status = 'approved'
     RETURNING *`,
    [gateway_refund_id || null, id]
  );

  if (result.rows.length === 0) {
    return response.error(res, 'Refund not found or not yet approved', 400);
  }

  await db.query(
    `UPDATE payments SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
    [result.rows[0].payment_id]
  );

  return response.success(res, result.rows[0], 'Refund marked as processed');
});

module.exports = { createRefund, listRefunds, approveRefund, processRefund };
