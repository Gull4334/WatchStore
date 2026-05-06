const db           = require('../../config/db');
const response     = require('../../utils/response');
const asyncHandler = require('../../utils/asyncHandler');

// GET /api/v1/analytics/summary
const getSummary = asyncHandler(async (req, res) => {
  const [orders, revenue, pending, products] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total_orders FROM orders`),
    db.query(`SELECT COALESCE(SUM(total_amount),0) AS total_revenue FROM orders WHERE status NOT IN ('cancelled','refunded')`),
    db.query(`SELECT COUNT(*) AS pending_payments FROM orders WHERE status = 'payment_submitted'`),
    db.query(`SELECT COUNT(*) AS total_products FROM products WHERE is_active = true`),
  ]);

  // Today stats
  const todayOrders = await db.query(
    `SELECT COUNT(*) AS today_orders, COALESCE(SUM(total_amount),0) AS today_revenue
     FROM orders
     WHERE DATE(created_at) = CURRENT_DATE AND status NOT IN ('cancelled','refunded')`
  );

  return response.success(res, {
    total_orders:     parseInt(orders.rows[0].total_orders),
    total_revenue:    parseFloat(revenue.rows[0].total_revenue),
    pending_payments: parseInt(pending.rows[0].pending_payments),
    total_products:   parseInt(products.rows[0].total_products),
    today_orders:     parseInt(todayOrders.rows[0].today_orders),
    today_revenue:    parseFloat(todayOrders.rows[0].today_revenue),
  });
});

// GET /api/v1/analytics/orders-by-day
const getOrdersByDay = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;

  const result = await db.query(
    `SELECT
       DATE(created_at) AS date,
       COUNT(*) AS order_count,
       COALESCE(SUM(total_amount), 0) AS revenue
     FROM orders
     WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
       AND status NOT IN ('cancelled', 'refunded')
     GROUP BY DATE(created_at)
     ORDER BY date ASC`
  );

  return response.success(res, result.rows);
});

// GET /api/v1/analytics/top-products
const getTopProducts = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  const result = await db.query(
    `SELECT
       oi.product_id,
       oi.product_name,
       SUM(oi.quantity) AS total_units_sold,
       SUM(oi.line_total) AS total_revenue,
       COUNT(DISTINCT oi.order_id) AS order_count,
       p.stock_quantity AS current_stock,
       (SELECT url FROM product_images WHERE product_id = p.id AND is_primary = true LIMIT 1) AS image
     FROM order_items oi
     LEFT JOIN products p ON oi.product_id = p.id
     JOIN orders o ON oi.order_id = o.id
     WHERE o.status NOT IN ('cancelled', 'refunded')
     GROUP BY oi.product_id, oi.product_name, p.stock_quantity, p.id
     ORDER BY total_units_sold DESC
     LIMIT $1`,
    [parseInt(limit)]
  );

  return response.success(res, result.rows);
});

// GET /api/v1/analytics/orders-by-status
const getOrdersByStatus = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT status, COUNT(*) AS count
     FROM orders
     GROUP BY status
     ORDER BY count DESC`
  );
  return response.success(res, result.rows);
});

// GET /api/v1/analytics/revenue-by-payment-method
const getRevenueByPaymentMethod = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT
       payment_method,
       COUNT(*) AS order_count,
       COALESCE(SUM(total_amount), 0) AS revenue
     FROM orders
     WHERE status NOT IN ('cancelled', 'refunded')
     GROUP BY payment_method
     ORDER BY revenue DESC`
  );
  return response.success(res, result.rows);
});

module.exports = { getSummary, getOrdersByDay, getTopProducts, getOrdersByStatus, getRevenueByPaymentMethod };
