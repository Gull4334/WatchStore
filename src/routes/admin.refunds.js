// src/routes/admin.refunds.js
// B31 — GET   /api/admin/refunds
// B32 — PATCH /api/admin/refunds/:id/approve
// B33 — PATCH /api/admin/refunds/:id/process

const router         = require('express').Router();
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { validateQuery } = require('../middleware/validate');
const { refundsQuerySchema } = require('../validators/admin.validators');

// B31 — Refunds list
router.get('/', validateQuery(refundsQuerySchema), async (req, res) => {
  const { status, limit, offset } = req.query;

  let query = supabaseAdmin
    .from('refunds')
    .select(`
      id, amount, reason, status, requested_at, processed_at,
      orders ( id, order_number, customer_name, whatsapp_number )
    `, { count: 'exact' })
    .order('requested_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return R.error(res, 'Failed to load refunds');

  const formatted = data.map(r => ({
    refund_id:       r.id,
    order_number:    r.orders?.order_number,
    customer_name:   r.orders?.customer_name,
    whatsapp_number: r.orders?.whatsapp_number,
    amount:          r.amount,
    reason:          r.reason,
    status:          r.status,
    requested_at:    r.requested_at,
    processed_at:    r.processed_at,
  }));

  return R.success(res, { data: formatted, total: count, limit, offset });
});

// B32 — Approve refund
router.patch('/:id/approve', async (req, res) => {
  const { id } = req.params;

  const { data: refund } = await supabaseAdmin
    .from('refunds')
    .select('id, status, order_id')
    .eq('id', id)
    .single();

  if (!refund) return R.notFound(res, 'Refund not found');
  if (refund.status !== 'pending') {
    return R.business(res, `Cannot approve refund with status: ${refund.status}`);
  }

  const { data, error } = await supabaseAdmin
    .from('refunds')
    .update({ status: 'approved', processed_by: req.admin.id })
    .eq('id', id)
    .select('id, status')
    .single();

  if (error) return R.error(res, 'Failed to approve refund');

  await supabaseAdmin.from('activity_logs').insert({
    order_id:   refund.order_id,
    admin_id:   req.admin.id,
    event_type: 'refund_approved',
    description:'Refund approved — pending manual bank transfer',
    metadata:   { refund_id: id, approved_by: req.admin.email },
  });

  return R.success(res, { refund_id: id, status: 'approved', processed_by: req.admin.id });
});

// B33 — Mark refund as processed (money returned)
router.patch('/:id/process', async (req, res) => {
  const { id } = req.params;

  const { data: refund } = await supabaseAdmin
    .from('refunds')
    .select('id, status, order_id, amount')
    .eq('id', id)
    .single();

  if (!refund) return R.notFound(res, 'Refund not found');
  if (!['pending', 'approved'].includes(refund.status)) {
    return R.business(res, `Cannot process refund with status: ${refund.status}`);
  }

  const now = new Date().toISOString();

  await supabaseAdmin
    .from('refunds')
    .update({ status: 'processed', processed_by: req.admin.id, processed_at: now })
    .eq('id', id);

  // Update order status to refunded
  await supabaseAdmin
    .from('orders')
    .update({ status: 'refunded' })
    .eq('id', refund.order_id);

  await supabaseAdmin.from('activity_logs').insert({
    order_id:   refund.order_id,
    admin_id:   req.admin.id,
    event_type: 'refund_processed',
    description:`Refund of PKR ${refund.amount} processed`,
    amount:     refund.amount,
    metadata:   { refund_id: id, processed_by: req.admin.email },
  });

  return R.success(res, {
    refund_id:    id,
    status:       'processed',
    order_status: 'refunded',
    processed_at: now,
  });
});

module.exports = router;
