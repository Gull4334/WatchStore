const db = require('../config/db');

/**
 * Generates a unique order number like WPK-00001
 * Pads to 5 digits, auto-increments based on last order
 */
const generateOrderNumber = async () => {
  const result = await db.query(
    `SELECT order_number FROM orders ORDER BY created_at DESC LIMIT 1`
  );

  if (result.rows.length === 0) {
    return 'WPK-00001';
  }

  const last = result.rows[0].order_number;
  const num  = parseInt(last.replace('WPK-', ''), 10);
  const next = String(num + 1).padStart(5, '0');
  return `WPK-${next}`;
};

module.exports = { generateOrderNumber };
