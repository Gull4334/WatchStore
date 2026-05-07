// src/routes/admin.dashboard.js
// B4 — GET /api/admin/dashboard/stats
// B5 — GET /api/admin/dashboard/orders-by-day
// B6 — GET /api/admin/dashboard/payment-methods
// B7 — GET /api/admin/dashboard/activity-log

const router         = require('express').Router();
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { validateQuery } = require('../middleware/validate');
const { chartQuerySchema, activityQuerySchema } = require('../validators/admin.validators');

// B4 — KPI stat cards (uses v_dashboard_stats view)
router.get('/stats', async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('v_dashboard_stats')
    .select('*')
    .single();

  if (error) return R.error(res, 'Failed to load dashboard stats');
  return R.success(res, data);
});

// B5 — Orders by day bar chart
router.get('/orders-by-day', validateQuery(chartQuerySchema), async (req, res) => {
  const { days } = req.query;

  const { data, error } = await supabaseAdmin
    .rpc('get_analytics_orders_by_day', { p_days: days });

  if (error) return R.error(res, 'Failed to load chart data');
  return R.success(res, data);
});

// B6 — Payment method breakdown donut chart
router.get('/payment-methods', async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .rpc('get_payment_method_breakdown');

  if (error) return R.error(res, 'Failed to load payment method data');
  return R.success(res, data);
});

// B7 — Activity log
router.get('/activity-log', validateQuery(activityQuerySchema), async (req, res) => {
  const { limit, offset } = req.query;

  const { data, error, count } = await supabaseAdmin
    .from('activity_logs')
    .select(`
      id, event_type, description, amount, created_at,
      orders ( order_number, customer_name )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return R.error(res, 'Failed to load activity log');

  const formatted = data.map(log => ({
    id:            log.id,
    event_type:    log.event_type,
    description:   log.description,
    amount:        log.amount,
    order_number:  log.orders?.order_number || null,
    customer_name: log.orders?.customer_name || null,
    created_at:    log.created_at,
  }));

  return R.success(res, { data: formatted, total: count, limit, offset });
});

module.exports = router;
