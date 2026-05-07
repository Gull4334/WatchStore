// src/routes/public.categories.js
// A3 — GET /api/categories

const router     = require('express').Router();
const { supabase } = require('../config/supabase');
const R          = require('../utils/response');

// A3 — List active categories with live product count
router.get('/', async (_req, res) => {
  // Fetch active categories
  const { data: cats, error: catErr } = await supabase
    .from('categories')
    .select('id, name, slug, image_url, sort_order')
    .eq('status', 'active')
    .order('sort_order', { ascending: true });

  if (catErr) return R.error(res, 'Failed to load categories');

  // Get product counts per category (active products only)
  const { data: counts, error: cntErr } = await supabase
    .from('products')
    .select('category_id')
    .eq('status', 'active');

  if (cntErr) return R.error(res, 'Failed to load product counts');

  const countMap = counts.reduce((acc, p) => {
    acc[p.category_id] = (acc[p.category_id] || 0) + 1;
    return acc;
  }, {});

  const result = cats.map(c => ({ ...c, product_count: countMap[c.id] || 0 }));
  return R.success(res, result);
});

module.exports = router;
