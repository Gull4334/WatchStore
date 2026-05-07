// src/routes/admin.customers.js
// B29 — GET /api/admin/customers
// B30 — GET /api/admin/customers/:id/orders

const router         = require('express').Router();
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { validateQuery } = require('../middleware/validate');
const { customersQuerySchema } = require('../validators/admin.validators');

// B29 — Customer list (v_customer_summary view)
router.get('/', validateQuery(customersQuerySchema), async (req, res) => {
  const { search, source, limit, offset } = req.query;

  let query = supabaseAdmin
    .from('v_customer_summary')
    .select('*', { count: 'exact' })
    .order('last_order_at', { ascending: false, nullsLast: true })
    .range(offset, offset + limit - 1);

  if (source) query = query.eq('source', source);
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,whatsapp_number.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) return R.error(res, 'Failed to load customers');
  return R.success(res, { data, total: count, limit, offset });
});

// B30 — Customer order history
router.get('/:id/orders', async (req, res) => {
  const { id } = req.params;

  // Get customer's whatsapp_number first
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('whatsapp_number, name')
    .eq('id', id)
    .single();

  if (!customer) return R.notFound(res, 'Customer not found');

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('order_number, status, total_amount, payment_method, source, created_at')
    .eq('whatsapp_number', customer.whatsapp_number)
    .order('created_at', { ascending: false });

  if (error) return R.error(res, 'Failed to load customer orders');

  return R.success(res, {
    customer_name:    customer.name,
    whatsapp_number:  customer.whatsapp_number,
    orders:           orders || [],
  });
});

module.exports = router;
