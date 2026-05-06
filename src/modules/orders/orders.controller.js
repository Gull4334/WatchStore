const db                  = require('../../config/db');
const response            = require('../../utils/response');
const asyncHandler        = require('../../utils/asyncHandler');
const { generateOrderNumber } = require('../../utils/orderNumber');

// POST /api/v1/orders  (guest checkout)
const createOrder = asyncHandler(async (req, res) => {
  const {
    full_name, phone, email, city, address, instagram_handle,
    items, payment_method, notes, discount_code, source = 'website',
  } = req.body;

  if (!items || items.length === 0) {
    return response.error(res, 'Order must have at least one item', 400);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Upsert customer
    let customerId;
    const existingCustomer = await client.query(
      `SELECT id FROM customers WHERE phone = $1 LIMIT 1`, [phone]
    );
    if (existingCustomer.rows.length > 0) {
      customerId = existingCustomer.rows[0].id;
      await client.query(
        `UPDATE customers SET full_name=$1, city=$2, address=$3, updated_at=NOW() WHERE id=$4`,
        [full_name, city, address, customerId]
      );
    } else {
      const newCustomer = await client.query(
        `INSERT INTO customers (full_name, phone, email, city, address, instagram_handle)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [full_name, phone, email || null, city, address, instagram_handle || null]
      );
      customerId = newCustomer.rows[0].id;
    }

    // 2. Validate products & calculate totals
    let subtotal = 0;
    const lineItems = [];

    for (const item of items) {
      const productResult = await client.query(
        `SELECT id, name, price, stock_quantity FROM products
         WHERE id = $1 AND is_active = true`,
        [item.product_id]
      );
      if (productResult.rows.length === 0) {
        throw Object.assign(new Error(`Product not found: ${item.product_id}`), { statusCode: 400 });
      }
      const product = productResult.rows[0];
      if (product.stock_quantity < item.quantity) {
        throw Object.assign(
          new Error(`Insufficient stock for: ${product.name}`), { statusCode: 400 }
        );
      }
      const lineTotal = parseFloat(product.price) * item.quantity;
      subtotal += lineTotal;
      lineItems.push({ ...product, quantity: item.quantity, lineTotal });
    }

    // 3. Apply discount code
    let discountAmount = 0;
    let discountCodeId = null;

    if (discount_code) {
      const codeResult = await client.query(
        `SELECT * FROM discount_codes
         WHERE code = $1 AND is_active = true
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (max_uses IS NULL OR used_count < max_uses)`,
        [discount_code.toUpperCase()]
      );
      if (codeResult.rows.length > 0) {
        const code = codeResult.rows[0];
        if (subtotal >= parseFloat(code.min_order_amount)) {
          discountCodeId = code.id;
          discountAmount = code.type === 'percentage'
            ? (subtotal * parseFloat(code.value)) / 100
            : Math.min(parseFloat(code.value), subtotal);
          discountAmount = Math.round(discountAmount * 100) / 100;
        }
      }
    }

    const shippingFee  = 200; // PKR flat rate — make configurable later
    const totalAmount  = subtotal - discountAmount + shippingFee;
    const orderNumber  = await generateOrderNumber();

    // 4. Create order
    const orderResult = await client.query(
      `INSERT INTO orders
         (order_number, customer_id, discount_code_id, status, subtotal,
          discount_amount, shipping_fee, total_amount, payment_method, source, notes)
       VALUES ($1,$2,$3,'pending_payment',$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [orderNumber, customerId, discountCodeId, subtotal,
       discountAmount, shippingFee, totalAmount, payment_method, source, notes || null]
    );
    const order = orderResult.rows[0];

    // 5. Create order items & decrement stock
    for (const item of lineItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [order.id, item.id, item.name, item.price, item.quantity, item.lineTotal]
      );
      await client.query(
        `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`,
        [item.quantity, item.id]
      );
    }

    // 6. Create pending payment record
    await client.query(
      `INSERT INTO payments (order_id, amount, currency, status)
       VALUES ($1,$2,'PKR','pending')`,
      [order.id, totalAmount]
    );

    // 7. Increment discount code usage
    if (discountCodeId) {
      await client.query(
        `UPDATE discount_codes SET used_count = used_count + 1 WHERE id = $1`,
        [discountCodeId]
      );
      await client.query(
        `INSERT INTO discount_usage (discount_code_id, order_id, customer_id, discount_applied)
         VALUES ($1,$2,$3,$4)`,
        [discountCodeId, order.id, customerId, discountAmount]
      );
    }

    await client.query('COMMIT');

    return response.created(res, {
      order_id:      order.id,
      order_number:  order.order_number,
      total_amount:  order.total_amount,
      payment_method,
      status:        order.status,
    }, 'Order placed successfully');

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/v1/orders/track/:orderNumber  (public)
const trackOrder = asyncHandler(async (req, res) => {
  const { orderNumber } = req.params;

  const result = await db.query(
    `SELECT
       o.order_number, o.status, o.total_amount, o.created_at,
       c.full_name, c.city,
       s.courier, s.tracking_number, s.dispatched_at, s.estimated_delivery, s.delivered_at,
       p.status AS payment_status
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     LEFT JOIN shipments s ON o.id = s.order_id
     LEFT JOIN payments p ON o.id = p.order_id
     WHERE o.order_number = $1`,
    [orderNumber.toUpperCase()]
  );

  if (result.rows.length === 0) return response.notFound(res, 'Order not found');
  return response.success(res, result.rows[0]);
});

// GET /api/v1/orders  (admin)
const listOrders = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 20,
    status, search,
    sort = 'created_at', order = 'desc',
  } = req.query;

  const offset     = (parseInt(page) - 1) * parseInt(limit);
  const conditions = [];
  const params     = [];
  let   pi         = 1;

  if (status) { conditions.push(`o.status = $${pi++}`);              params.push(status); }
  if (search) { conditions.push(`(o.order_number ILIKE $${pi++} OR c.phone ILIKE $${pi++} OR c.full_name ILIKE $${pi++})`);
                params.push(`%${search}%`, `%${search}%`, `%${search}%`); pi += 2; }

  const where    = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeSort = ['created_at', 'total_amount', 'status'].includes(sort) ? sort : 'created_at';
  const safeOrd  = order === 'asc' ? 'asc' : 'desc';

  const dataQuery = `
    SELECT
      o.id, o.order_number, o.status, o.total_amount, o.payment_method,
      o.created_at, o.source,
      c.full_name, c.phone, c.city,
      p.status AS payment_status, p.screenshot_url
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    LEFT JOIN payments p ON o.id = p.order_id
    ${where}
    ORDER BY o.${safeSort} ${safeOrd}
    LIMIT $${pi++} OFFSET $${pi++}
  `;

  const countQuery = `
    SELECT COUNT(*) FROM orders o
    JOIN customers c ON o.customer_id = c.id
    ${where}
  `;

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

// GET /api/v1/orders/:id  (admin)
const getOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const orderResult = await db.query(
    `SELECT o.*, c.full_name, c.phone, c.email, c.city, c.address, c.instagram_handle
     FROM orders o JOIN customers c ON o.customer_id = c.id
     WHERE o.id = $1`,
    [id]
  );
  if (orderResult.rows.length === 0) return response.notFound(res, 'Order not found');

  const order = orderResult.rows[0];

  const [items, payment, shipment] = await Promise.all([
    db.query(`SELECT oi.*, pi2.url AS product_image
              FROM order_items oi
              LEFT JOIN product_images pi2 ON oi.product_id = pi2.product_id AND pi2.is_primary = true
              WHERE oi.order_id = $1`, [id]),
    db.query(`SELECT * FROM payments WHERE order_id = $1`, [id]),
    db.query(`SELECT * FROM shipments WHERE order_id = $1`, [id]),
  ]);

  order.items    = items.rows;
  order.payment  = payment.rows[0] || null;
  order.shipment = shipment.rows[0] || null;

  return response.success(res, order);
});

// PUT /api/v1/orders/:id/status  (admin)
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { id }     = req.params;
  const { status } = req.body;

  const validStatuses = [
    'pending_payment', 'payment_submitted', 'payment_confirmed',
    'processing', 'dispatched', 'delivered', 'cancelled', 'refunded',
  ];

  if (!validStatuses.includes(status)) {
    return response.error(res, 'Invalid status', 400);
  }

  const result = await db.query(
    `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [status, id]
  );

  if (result.rows.length === 0) return response.notFound(res, 'Order not found');
  return response.success(res, result.rows[0], 'Order status updated');
});

// DELETE /api/v1/orders/:id  (cancel)
const cancelOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await db.query(
    `UPDATE orders SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND status IN ('pending_payment', 'payment_submitted')
     RETURNING id, order_number`,
    [id]
  );
  if (result.rows.length === 0) {
    return response.error(res, 'Order not found or cannot be cancelled', 400);
  }
  return response.success(res, null, `Order ${result.rows[0].order_number} cancelled`);
});

module.exports = { createOrder, trackOrder, listOrders, getOrder, updateOrderStatus, cancelOrder };
