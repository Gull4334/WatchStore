const db           = require('../../config/db');
const response     = require('../../utils/response');
const asyncHandler = require('../../utils/asyncHandler');

// POST /api/v1/payments/submit  (customer submits screenshot)
const submitPayment = asyncHandler(async (req, res) => {
  const { order_id, order_number, transaction_ref, screenshot_url } = req.body;

  // Accept either order_id or order_number
  let orderId = order_id;
  if (!orderId && order_number) {
    const r = await db.query(
      `SELECT id FROM orders WHERE order_number = $1`, [order_number.toUpperCase()]
    );
    if (r.rows.length === 0) return response.notFound(res, 'Order not found');
    orderId = r.rows[0].id;
  }

  // Verify order is in correct state
  const orderResult = await db.query(
    `SELECT id, status, total_amount FROM orders WHERE id = $1`, [orderId]
  );
  if (orderResult.rows.length === 0) return response.notFound(res, 'Order not found');

  const order = orderResult.rows[0];
  if (!['pending_payment', 'payment_submitted'].includes(order.status)) {
    return response.error(res, 'Payment cannot be submitted for this order status', 400);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Update payment record
    await client.query(
      `UPDATE payments
       SET status = 'submitted',
           screenshot_url = $1,
           transaction_ref = $2,
           submitted_at = NOW(),
           updated_at = NOW()
       WHERE order_id = $3`,
      [screenshot_url || null, transaction_ref || null, orderId]
    );

    // Update order status
    await client.query(
      `UPDATE orders SET status = 'payment_submitted', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );

    await client.query('COMMIT');

    return response.success(res, {
      order_id:     orderId,
      order_number: order_number || order.order_number,
    }, 'Payment proof submitted. We will verify within 2 hours.');

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/v1/payments  (admin — list all)
const listPayments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const offset     = (parseInt(page) - 1) * parseInt(limit);
  const conditions = [];
  const params     = [];
  let   pi         = 1;

  if (status) { conditions.push(`p.status = $${pi++}`); params.push(status); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataQuery = `
    SELECT
      p.id, p.amount, p.currency, p.status, p.screenshot_url,
      p.transaction_ref, p.submitted_at, p.verified_at,
      o.order_number, o.payment_method,
      c.full_name, c.phone,
      u.name AS verified_by_name
    FROM payments p
    JOIN orders o ON p.order_id = o.id
    JOIN customers c ON o.customer_id = c.id
    LEFT JOIN users u ON p.verified_by = u.id
    ${where}
    ORDER BY p.submitted_at DESC NULLS LAST, p.created_at DESC
    LIMIT $${pi++} OFFSET $${pi++}
  `;

  const countQuery = `SELECT COUNT(*) FROM payments p ${where}`;

  const [data, count] = await Promise.all([
    db.query(dataQuery, [...params, parseInt(limit), offset]),
    db.query(countQuery, params),
  ]);

  const total = parseInt(count.rows[0].count);
  return response.paginated(res, data.rows, {
    page: parseInt(page), limit: parseInt(limit),
    total, total_pages: Math.ceil(total / parseInt(limit)),
  });
});

// GET /api/v1/payments/:id  (admin)
const getPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    `SELECT
       p.*,
       o.order_number, o.payment_method, o.total_amount,
       c.full_name, c.phone, c.city,
       u.name AS verified_by_name
     FROM payments p
     JOIN orders o ON p.order_id = o.id
     JOIN customers c ON o.customer_id = c.id
     LEFT JOIN users u ON p.verified_by = u.id
     WHERE p.id = $1`,
    [id]
  );

  if (result.rows.length === 0) return response.notFound(res, 'Payment not found');
  return response.success(res, result.rows[0]);
});

// POST /api/v1/payments/:id/confirm  (admin — verify payment)
const confirmPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const paymentResult = await db.query(
    `SELECT p.id, p.order_id, p.status, o.order_number, c.phone, c.full_name
     FROM payments p
     JOIN orders o ON p.order_id = o.id
     JOIN customers c ON o.customer_id = c.id
     WHERE p.id = $1`,
    [id]
  );

  if (paymentResult.rows.length === 0) return response.notFound(res, 'Payment not found');

  const payment = paymentResult.rows[0];
  if (payment.status !== 'submitted') {
    return response.error(res, 'Only submitted payments can be confirmed', 400);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Verify payment
    await client.query(
      `UPDATE payments
       SET status = 'verified', verified_by = $1, verified_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [req.user.id, id]
    );

    // Update order status
    await client.query(
      `UPDATE orders SET status = 'payment_confirmed', updated_at = NOW() WHERE id = $1`,
      [payment.order_id]
    );

    // Log notification (WhatsApp would be triggered here via service)
    await client.query(
      `INSERT INTO notifications_log (order_id, channel, recipient, message_type, status)
       VALUES ($1, 'whatsapp', $2, 'payment_confirmed', 'sent')`,
      [payment.order_id, payment.phone]
    );

    await client.query('COMMIT');

    return response.success(res, {
      order_number: payment.order_number,
      customer:     payment.full_name,
    }, 'Payment confirmed. Customer notified via WhatsApp.');

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/v1/payments/:id/reject  (admin)
const rejectPayment = asyncHandler(async (req, res) => {
  const { id }     = req.params;
  const { reason } = req.body;

  const paymentResult = await db.query(
    `SELECT p.id, p.order_id, p.status, o.order_number, c.phone
     FROM payments p
     JOIN orders o ON p.order_id = o.id
     JOIN customers c ON o.customer_id = c.id
     WHERE p.id = $1`,
    [id]
  );

  if (paymentResult.rows.length === 0) return response.notFound(res, 'Payment not found');

  const payment = paymentResult.rows[0];
  if (payment.status !== 'submitted') {
    return response.error(res, 'Only submitted payments can be rejected', 400);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE payments SET status = 'rejected', updated_at = NOW() WHERE id = $1`, [id]
    );

    await client.query(
      `UPDATE orders SET status = 'pending_payment', updated_at = NOW() WHERE id = $1`,
      [payment.order_id]
    );

    await client.query(
      `INSERT INTO notifications_log (order_id, channel, recipient, message_type, status)
       VALUES ($1, 'whatsapp', $2, 'payment_rejected', 'sent')`,
      [payment.order_id, payment.phone]
    );

    await client.query('COMMIT');

    return response.success(res, null, 'Payment rejected. Customer notified to resubmit.');

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/v1/payments/methods  (public — list active payment methods)
const listPaymentMethods = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT id, name, code, type, mode, config
     FROM payment_methods
     WHERE is_active = true
     ORDER BY name ASC`
  );
  // Strip sensitive keys from config before sending to public
  const safe = result.rows.map(pm => {
    const { config, ...rest } = pm;
    return {
      ...rest,
      account_title:  config.account_title  || null,
      account_number: config.account_number || null,
      mobile_number:  config.mobile_number  || null,
      iban:           config.iban           || null,
    };
  });
  return response.success(res, safe);
});

module.exports = { submitPayment, listPayments, getPayment, confirmPayment, rejectPayment, listPaymentMethods };
