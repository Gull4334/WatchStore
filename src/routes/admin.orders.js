// src/routes/admin.orders.js
// B8  — GET   /api/admin/orders
// B9  — GET   /api/admin/orders/:id
// B10 — POST  /api/admin/orders/manual
// B11 — PATCH /api/admin/orders/:id/cancel

const router         = require('express').Router();
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { validate, validateQuery } = require('../middleware/validate');
const { ordersQuerySchema, manualOrderSchema, cancelOrderSchema } = require('../validators/admin.validators');

// B8 — Paginated orders list with filters
router.get('/', validateQuery(ordersQuerySchema), async (req, res) => {
  const { status, search, source, limit, offset } = req.query;

  let query = supabaseAdmin
    .from('orders')
    .select(`
      id, order_number, customer_name, whatsapp_number, city,
      payment_method, status, source, total_amount, created_at,
      order_items ( count )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (source) query = query.eq('source', source);
  if (search) {
    query = query.or(
      `order_number.ilike.%${search}%,customer_name.ilike.%${search}%,whatsapp_number.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) return R.error(res, 'Failed to load orders');

  const formatted = data.map(o => ({
    ...o,
    items_count: o.order_items?.[0]?.count || 0,
    order_items: undefined,
  }));

  return R.success(res, { data: formatted, total: count, limit, offset });
});

// B10 must be before /:id to avoid route collision
// B10 — Create manual order (admin-side, e.g. from Instagram DM)
router.post('/manual', validate(manualOrderSchema), async (req, res) => {
  const {
    customer_name, whatsapp_number, city, address,
    instagram_handle, product_id, quantity,
    payment_method, source, notes,
  } = req.body;

  // Fetch product for pricing and stock check
  const { data: product, error: pErr } = await supabaseAdmin
    .from('products')
    .select('id, name, price, stock_quantity, status')
    .eq('id', product_id)
    .single();

  if (pErr || !product) return R.notFound(res, 'Product not found');
  if (product.status !== 'active') return R.business(res, 'Product is not available');
  if (product.stock_quantity < quantity) {
    return R.business(res, `Only ${product.stock_quantity} units available`);
  }

  // Fetch shipping fee from settings
  const { data: settings } = await supabaseAdmin
    .from('settings')
    .select('shipping_fee, free_shipping_threshold')
    .single();

  const subtotal     = product.price * quantity;
  const shippingFee  = subtotal >= (settings?.free_shipping_threshold || 5000) ? 0 : (settings?.shipping_fee || 200);
  const totalAmount  = subtotal + shippingFee;

  // Create order
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .insert({
      customer_name, whatsapp_number, city, address,
      instagram_handle: instagram_handle || null,
      order_notes: notes || null,
      payment_method, source,
      subtotal, shipping_fee: shippingFee, discount_amount: 0, total_amount: totalAmount,
      status: 'pending_payment',
    })
    .select('id, order_number, status')
    .single();

  if (orderErr) return R.error(res, 'Failed to create order');

  // Insert order item
  await supabaseAdmin.from('order_items').insert({
    order_id:     order.id,
    product_id:   product.id,
    product_name: product.name,
    quantity,
    unit_price:   product.price,
    subtotal:     product.price * quantity,
  });

  // Log in activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    order_id:    order.id,
    admin_id:    req.admin.id,
    event_type:  'order_placed',
    description: `Manual order ${order.order_number} created by admin`,
    amount:      totalAmount,
    metadata:    { source, created_by: req.admin.email },
  });

  return R.created(res, {
    order_id:     order.id,
    order_number: order.order_number,
    status:       order.status,
    total_amount: totalAmount,
  });
});

// B9 — Single order full detail (uses v_order_detail view)
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const { data: order, error } = await supabaseAdmin
    .from('v_order_detail')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !order) return R.notFound(res, 'Order not found');

  // Fetch line items
  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('product_name, quantity, unit_price, subtotal, product_id')
    .eq('order_id', id);

  // Build timeline steps
  const statusOrder = ['pending_payment','payment_submitted','payment_confirmed','dispatched','delivered'];
  const currentIdx  = statusOrder.indexOf(order.status);

  const timeline_steps = {
    order_placed:       true,
    payment_submitted:  currentIdx >= 1 || order.status === 'payment_submitted',
    payment_confirmed:  currentIdx >= 2,
    dispatched:         currentIdx >= 3,
    delivered:          order.status === 'delivered',
  };

  return R.success(res, {
    ...order,
    items:          items || [],
    payment: {
      screenshot_url:       order.screenshot_url,
      transaction_ref:      order.transaction_ref,
      status:               order.payment_status,
      submitted_at:         order.payment_submitted_at,
      verified_at:          order.payment_verified_at,
    },
    shipment: order.tcs_tracking_number ? {
      tcs_tracking_number:     order.tcs_tracking_number,
      courier:                 order.courier,
      estimated_delivery_date: order.estimated_delivery_date,
      status:                  order.shipment_status,
      dispatched_at:           order.dispatched_at,
      delivered_at:            order.delivered_at,
    } : null,
    timeline_steps,
    // Remove flat fields already nested above
    screenshot_url: undefined, transaction_ref: undefined,
    payment_status: undefined, payment_submitted_at: undefined, payment_verified_at: undefined,
    tcs_tracking_number: undefined, courier: undefined,
    estimated_delivery_date: undefined, shipment_status: undefined,
    dispatched_at: undefined, delivered_at: undefined,
  });
});

// B11 — Cancel order
router.patch('/:id/cancel', validate(cancelOrderSchema), async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, status')
    .eq('id', id)
    .single();

  if (!order) return R.notFound(res, 'Order not found');
  if (order.status === 'delivered') {
    return R.business(res, 'Cannot cancel a delivered order');
  }
  if (order.status === 'cancelled') {
    return R.business(res, 'Order is already cancelled');
  }

  const { error } = await supabaseAdmin
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', id);

  if (error) return R.error(res, 'Failed to cancel order');

  // Log admin action
  await supabaseAdmin.from('activity_logs').insert({
    order_id:   order.id,
    admin_id:   req.admin.id,
    event_type: 'order_cancelled',
    description:`Order ${order.order_number} cancelled by admin`,
    metadata:   { reason: reason || null, cancelled_by: req.admin.email },
  });

  return R.success(res, { order_number: order.order_number, status: 'cancelled' });
});

module.exports = router;
