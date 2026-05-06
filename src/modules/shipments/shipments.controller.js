const db           = require('../../config/db');
const response     = require('../../utils/response');
const asyncHandler = require('../../utils/asyncHandler');

// POST /api/v1/shipments  (admin — create shipment for order)
const createShipment = asyncHandler(async (req, res) => {
  const { order_id, courier = 'TCS', tracking_number, estimated_delivery } = req.body;

  // Verify order exists and is confirmed
  const orderResult = await db.query(
    `SELECT o.id, o.status, o.order_number, c.phone, c.full_name
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     WHERE o.id = $1`,
    [order_id]
  );

  if (orderResult.rows.length === 0) return response.notFound(res, 'Order not found');

  const order = orderResult.rows[0];
  if (!['payment_confirmed', 'processing'].includes(order.status)) {
    return response.error(res, 'Order must be payment_confirmed or processing to dispatch', 400);
  }

  // Check no shipment already exists
  const existing = await db.query(
    `SELECT id FROM shipments WHERE order_id = $1`, [order_id]
  );
  if (existing.rows.length > 0) {
    return response.error(res, 'Shipment already exists for this order', 409);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const shipResult = await client.query(
      `INSERT INTO shipments (order_id, courier, tracking_number, dispatched_at, estimated_delivery)
       VALUES ($1, $2, $3, NOW(), $4)
       RETURNING *`,
      [order_id, courier, tracking_number || null, estimated_delivery || null]
    );

    // Update order status
    await client.query(
      `UPDATE orders SET status = 'dispatched', updated_at = NOW() WHERE id = $1`,
      [order_id]
    );

    // Log WhatsApp notification
    await client.query(
      `INSERT INTO notifications_log (order_id, channel, recipient, message_type, status)
       VALUES ($1, 'whatsapp', $2, 'order_dispatched', 'sent')`,
      [order_id, order.phone]
    );

    await client.query('COMMIT');

    return response.created(res, shipResult.rows[0],
      `Order ${order.order_number} dispatched. Customer notified via WhatsApp.`
    );

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PUT /api/v1/shipments/:id  (admin — update tracking number)
const updateShipment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tracking_number, courier, estimated_delivery } = req.body;

  const fields = [];
  const values = [];
  let   pi     = 1;

  if (tracking_number)   { fields.push(`tracking_number = $${pi++}`);   values.push(tracking_number); }
  if (courier)           { fields.push(`courier = $${pi++}`);            values.push(courier); }
  if (estimated_delivery){ fields.push(`estimated_delivery = $${pi++}`); values.push(estimated_delivery); }

  if (fields.length === 0) return response.error(res, 'No fields to update', 400);

  values.push(id);
  const result = await db.query(
    `UPDATE shipments SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${pi} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return response.notFound(res, 'Shipment not found');

  return response.success(res, result.rows[0], 'Shipment updated. Customer notified.');
});

// PUT /api/v1/shipments/:id/delivered  (admin)
const markDelivered = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const shipResult = await db.query(
    `UPDATE shipments SET delivered_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING order_id`,
    [id]
  );

  if (shipResult.rows.length === 0) return response.notFound(res, 'Shipment not found');

  await db.query(
    `UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
    [shipResult.rows[0].order_id]
  );

  return response.success(res, null, 'Order marked as delivered');
});

// GET /api/v1/shipments  (admin — list all)
const listShipments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const result = await db.query(
    `SELECT
       s.id, s.courier, s.tracking_number, s.dispatched_at,
       s.estimated_delivery, s.delivered_at,
       o.order_number, o.status AS order_status,
       c.full_name, c.phone, c.city
     FROM shipments s
     JOIN orders o ON s.order_id = o.id
     JOIN customers c ON o.customer_id = c.id
     ORDER BY s.dispatched_at DESC NULLS LAST
     LIMIT $1 OFFSET $2`,
    [parseInt(limit), offset]
  );

  return response.paginated(res, result.rows, {
    page: parseInt(page), limit: parseInt(limit),
    total: result.rows.length,
  });
});

module.exports = { createShipment, updateShipment, markDelivered, listShipments };
