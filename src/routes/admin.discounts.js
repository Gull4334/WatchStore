// src/routes/admin.discounts.js
// B25 — GET   /api/admin/discounts
// B26 — POST  /api/admin/discounts
// B27 — PUT   /api/admin/discounts/:id
// B28 — PATCH /api/admin/discounts/:id/disable

const router         = require('express').Router();
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { validate, validateQuery } = require('../middleware/validate');
const { discountsQuerySchema, discountSchema } = require('../validators/admin.validators');

// B25 — All discount codes
router.get('/', validateQuery(discountsQuerySchema), async (req, res) => {
  const { status, limit, offset } = req.query;

  let query = supabaseAdmin
    .from('discounts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return R.error(res, 'Failed to load discounts');
  return R.success(res, { data, total: count, limit, offset });
});

// B26 — Create discount code
router.post('/', validate(discountSchema), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('discounts')
    .insert({ ...req.body, status: 'active', used_count: 0 })
    .select('id, code, status, created_at')
    .single();

  if (error) {
    if (error.code === '23505') return R.conflict(res, `Discount code "${req.body.code}" already exists`);
    return R.error(res, 'Failed to create discount code');
  }

  await supabaseAdmin.from('activity_logs').insert({
    admin_id:   req.admin.id,
    event_type: 'discount_created',
    description:`Discount code "${data.code}" created`,
    metadata:   { code: data.code },
  });

  return R.created(res, data);
});

// B27 — Update discount code
router.put('/:id', validate(discountSchema), async (req, res) => {
  const { id } = req.params;
  // Never allow changing used_count via API
  const { ...updateData } = req.body;
  delete updateData.used_count;

  const { data, error } = await supabaseAdmin
    .from('discounts')
    .update(updateData)
    .eq('id', id)
    .select('id, code, status, updated_at')
    .single();

  if (error || !data) return R.notFound(res, 'Discount code not found');
  return R.success(res, data);
});

// B28 — Disable discount code
router.patch('/:id/disable', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from('discounts')
    .update({ status: 'disabled' })
    .eq('id', id)
    .select('id, code, status')
    .single();

  if (error || !data) return R.notFound(res, 'Discount code not found');
  return R.success(res, data);
});

module.exports = router;
