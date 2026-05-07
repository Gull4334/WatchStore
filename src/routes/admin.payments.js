// src/routes/admin.payments.js
// B12 — GET   /api/admin/payments
// B13 — PATCH /api/admin/payments/:id/confirm
// B14 — PATCH /api/admin/payments/:id/reject

const router         = require('express').Router();
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { validate, validateQuery } = require('../middleware/validate');
const { paymentsQuerySchema, rejectPaymentSchema } = require('../validators/admin.validators');
const { buildWaLink } = require('../utils/whatsapp');

// B12 — Payment submissions list
router.get('/', validateQuery(paymentsQuerySchema), async (req, res) => {
  const { status, limit, offset } = req.query;

  let query = supabaseAdmin
    .from('payments')
    .select(`
      id, method, amount, screenshot_url, transaction_ref,
      status, submitted_at, verified_at,
      orders ( id, order_number, customer_name, whatsapp_number, city )
    `, { count: 'exact' })
    .order('submitted_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return R.error(res, 'Failed to load payments');

  const formatted = data.map(p => ({
    payment_id:      p.id,
    order_id:        p.orders?.id,
    order_number:    p.orders?.order_number,
    customer_name:   p.orders?.customer_name,
    whatsapp_number: p.orders?.whatsapp_number,
    city:            p.orders?.city,
    method:          p.method,
    amount:          p.amount,
    screenshot_url:  p.screenshot_url,
    transaction_ref: p.transaction_ref,
    status:          p.status,
    submitted_at:    p.submitted_at,
    verified_at:     p.verified_at,
  }));

  return R.success(res, { data: formatted, total: count, limit, offset });
});

// B13 — Confirm payment
router.patch('/:id/confirm', async (req, res) => {
  const { id } = req.params;

  // Load payment with order info
  const { data: payment, error: pErr } = await supabaseAdmin
    .from('payments')
    .select('id, order_id, amount, status, orders ( id, order_number, customer_name, whatsapp_number )')
    .eq('id', id)
    .single();

  if (pErr || !payment) return R.notFound(res, 'Payment not found');
  if (payment.status === 'verified') return R.business(res, 'Payment is already verified');
  if (payment.status === 'rejected') return R.business(res, 'Cannot confirm a rejected payment');

  // Update payment record
  await supabaseAdmin
    .from('payments')
    .update({ status: 'verified', verified_by: req.admin.id, verified_at: new Date().toISOString() })
    .eq('id', id);

  // Update order status
  await supabaseAdmin
    .from('orders')
    .update({ status: 'payment_confirmed' })
    .eq('id', payment.order_id);

  // Build WhatsApp confirmation link
  const { data: settings } = await supabaseAdmin
    .from('settings')
    .select('whatsapp_number, wa_template_payment_confirmed')
    .single();

  const waLink = buildWaLink(
    payment.orders?.whatsapp_number,
    settings?.wa_template_payment_confirmed,
    {
      Name:      payment.orders?.customer_name,
      ORDER_NUM: payment.orders?.order_number,
      Amount:    `PKR ${payment.amount?.toLocaleString()}`,
    }
  );

  // Log action
  await supabaseAdmin.from('activity_logs').insert({
    order_id:   payment.order_id,
    admin_id:   req.admin.id,
    event_type: 'payment_confirmed',
    description:`Payment confirmed for order ${payment.orders?.order_number}`,
    amount:     payment.amount,
    metadata:   { confirmed_by: req.admin.email },
  });

  return R.success(res, {
    payment_id:    id,
    status:        'verified',
    order_number:  payment.orders?.order_number,
    order_status:  'payment_confirmed',
    whatsapp_link: waLink,
  });
});

// B14 — Reject payment
router.patch('/:id/reject', validate(rejectPaymentSchema), async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const { data: payment, error: pErr } = await supabaseAdmin
    .from('payments')
    .select('id, order_id, amount, status, orders ( id, order_number, customer_name, whatsapp_number )')
    .eq('id', id)
    .single();

  if (pErr || !payment) return R.notFound(res, 'Payment not found');
  if (payment.status === 'rejected') return R.business(res, 'Payment is already rejected');
  if (payment.status === 'verified') return R.business(res, 'Cannot reject an already verified payment');

  // Update payment
  await supabaseAdmin
    .from('payments')
    .update({ status: 'rejected', verified_by: req.admin.id, verified_at: new Date().toISOString() })
    .eq('id', id);

  // Cancel the order (which also triggers stock restore via DB trigger)
  await supabaseAdmin
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', payment.order_id);

  // Build rejection WhatsApp link
  const { data: settings } = await supabaseAdmin
    .from('settings')
    .select('whatsapp_number, wa_template_payment_rejected')
    .single();

  let template = settings?.wa_template_payment_rejected || '';
  if (reason) template = template + `\n\nReason: ${reason}`;

  const waLink = buildWaLink(
    payment.orders?.whatsapp_number,
    template,
    {
      Name:      payment.orders?.customer_name,
      ORDER_NUM: payment.orders?.order_number,
    }
  );

  // Log action
  await supabaseAdmin.from('activity_logs').insert({
    order_id:   payment.order_id,
    admin_id:   req.admin.id,
    event_type: 'payment_rejected',
    description:`Payment rejected for order ${payment.orders?.order_number}`,
    amount:     payment.amount,
    metadata:   { reason: reason || null, rejected_by: req.admin.email },
  });

  return R.success(res, {
    payment_id:    id,
    status:        'rejected',
    order_status:  'cancelled',
    whatsapp_link: waLink,
  });
});

module.exports = router;
