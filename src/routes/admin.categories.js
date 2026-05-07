// src/routes/admin.categories.js
// B22 — GET  /api/admin/categories
// B23 — POST /api/admin/categories
// B24 — PUT  /api/admin/categories/:id

const router         = require('express').Router();
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { validate }   = require('../middleware/validate');
const { categorySchema } = require('../validators/admin.validators');

// B22 — All categories (with product count)
router.get('/', async (_req, res) => {
  const { data: cats, error } = await supabaseAdmin
    .from('categories')
    .select('id, name, slug, image_url, status, sort_order, created_at')
    .order('sort_order', { ascending: true });

  if (error) return R.error(res, 'Failed to load categories');

  // Get product counts (active only)
  const { data: counts } = await supabaseAdmin
    .from('products')
    .select('category_id')
    .eq('status', 'active');

  const countMap = (counts || []).reduce((acc, p) => {
    acc[p.category_id] = (acc[p.category_id] || 0) + 1;
    return acc;
  }, {});

  const result = cats.map(c => ({ ...c, product_count: countMap[c.id] || 0 }));
  return R.success(res, result);
});

// B23 — Create category
router.post('/', validate(categorySchema), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .insert(req.body)
    .select('id, name, slug, status')
    .single();

  if (error) {
    if (error.code === '23505') return R.conflict(res, 'A category with this slug already exists');
    return R.error(res, 'Failed to create category');
  }
  return R.created(res, data);
});

// B24 — Update category
router.put('/:id', validate(categorySchema), async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from('categories')
    .update(req.body)
    .eq('id', id)
    .select('id, name, slug, status, updated_at')
    .single();

  if (error || !data) return R.notFound(res, 'Category not found');
  return R.success(res, data);
});

module.exports = router;
