// src/routes/admin.shipments.js
// B15 — GET   /api/admin/shipments
// B16 — PATCH /api/admin/shipments/:id/dispatch
// B17 — PATCH /api/admin/shipments/:id/deliver

const router         = require('express').Router();
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { validate, validateQuery } = require('../middleware/validate');
const { shipmentsQuerySchema, dispatchSchema } = require('../validators/admin.validators');
const { buildWaLink } = require('../utils/whatsapp');

// B15 — Shipments list
router.get('/', validateQuery(shipmentsQuerySchema), async (req, res) => {
  const { status, limit, offset } = req.query;

  // Eligible orders: payment_confirmed, dispatched, delivered
  let orderQuery = supabaseAdmin
    .from('orders')
    .select(`
      id, order_number, customer_name, whatsapp_number, city, total_amount,
      status as order_status,
      shipments ( id, tcs_tracking_number, courier, estimated_delivery_date, status, dispatched_at, delivered_at )
    `, { count: 'exact' })
    .in('status', ['payment_confirmed', 'dispatched', 'delivered'])
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Map shipment status filter to order status
  if (status === 'ready_to_dispatch') orderQuery = orderQuery.eq('status', 'payment_confirmed');
  else if (status === 'dispatched') orderQuery = orderQuery.eq('status', 'dispatched');
  else if (status === 'delivered')  orderQuery = orderQuery.eq('status', 'delivered');

  const { data, error, count } = await orderQuery;
  if (error) return R.error(res, 'Failed to load shipments');

  const formatted = data.map(o => ({
    order_id:                o.id,
    order_number:            o.order_number,
    customer_name:           o.customer_name,
    whatsapp_number:         o.whatsapp_number,
    city:                    o.city,
    total_amount:            o.total_amount,
    order_status:            o.order_status,
    shipment_id:             o.shipments?.[0]?.id || null,
    courier:                 o.shipments?.[0]?.courier || null,
    tcs_tracking_number:     o.shipments?.[0]?.tcs_tracking_number || null,
    shipment_status:         o.shipments?.[0]?.status || 'ready_to_dispatch',
    estimated_delivery_date: o.shipments?.[0]?.estimated_delivery_date || null,
    dispatched_at:           o.shipments?.[0]?.dispatched_at || null,
    delivered_at:            o.shipments?.[0]?.delivered_at || null,
  }));

  return R.success(res, { data: formatted, total: count, limit, offset });
});

// B16 — Dispatch order (add tracking number)
router.patch('/:id/dispatch', validate(dispatchSchema), async (req, res) => {
  const { id: order_id } = req.params;
  const { tcs_tracking_number, estimated_delivery_date, courier } = req.body;

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, whatsapp_number, customer_name, status')
    .eq('id', order_id)
    .single();

  if (!order) return R.notFound(res, 'Order not found');
  if (order.status !== 'payment_confirmed') {
    return R.business(res, `Order must be in payment_confirmed status to dispatch. Current: ${order.status}`);
  }

  const now = new Date().toISOString();

  // Upsert shipment record
  const { error: shipErr } = await supabaseAdmin
    .from('shipments')
    .upsert({
      order_id,
      tcs_tracking_number,
      courier:                 courier || 'tcs',
      estimated_delivery_date: estimated_delivery_date || null,
      status:                  'dispatched',
      dispatched_by:           req.admin.id,
      dispatched_at:           now,
    }, { onConflict: 'order_id' });

  if (shipErr) return R.error(res, 'Failed to save shipment record');

  // Update order status
  await supabaseAdmin
    .from('orders')
    .update({ status: 'dispatched' })
    .eq('id', order_id);

  // Build WhatsApp dispatch link
  const { data: settings } = await supabaseAdmin
    .from('settings')
    .select('wa_template_dispatched')
    .single();

  const waLink = buildWaLink(
    order.whatsapp_number,
    settings?.wa_template_dispatched,
    {
      Name:        order.customer_name,
      ORDER_NUM:   order.order_number,
      TCS_TRACKING:tcs_tracking_number,
      EST_DATE:    estimated_delivery_date || '2-3 working days',
    }
  );

  // Log action
  await supabaseAdmin.from('activity_logs').insert({
    order_id:   order.id,
    admin_id:   req.admin.id,
    event_type: 'order_dispatched',
    description:`Order ${order.order_number} dispatched. Tracking: ${tcs_tracking_number}`,
    metadata:   { tcs_tracking_number, courier, dispatched_by: req.admin.email },
  });

  return R.success(res, {
    order_number:        order.order_number,
    tcs_tracking_number,
    order_status:        'dispatched',
    whatsapp_link:       waLink,
    dispatched_at:       now,
  });
});

// B17 — Mark order as delivered
router.patch('/:id/deliver', async (req, res) => {
  const { id: order_id } = req.params;

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, status')
    .eq('id', order_id)
    .single();

  if (!order) return R.notFound(res, 'Order not found');
  if (order.status !== 'dispatched') {
    return R.business(res, `Order must be dispatched before marking delivered. Current: ${order.status}`);
  }

  const now = new Date().toISOString();

  await supabaseAdmin
    .from('orders')
    .update({ status: 'delivered' })
    .eq('id', order_id);

  await supabaseAdmin
    .from('shipments')
    .update({ status: 'delivered', delivered_at: now })
    .eq('order_id', order_id);

  await supabaseAdmin.from('activity_logs').insert({
    order_id:   order.id,
    admin_id:   req.admin.id,
    event_type: 'order_delivered',
    description:`Order ${order.order_number} marked as delivered`,
    metadata:   { delivered_by: req.admin.email },
  });

  return R.success(res, {
    order_number:  order.order_number,
    order_status:  'delivered',
    delivered_at:  now,
  });
});

module.exports = router;
