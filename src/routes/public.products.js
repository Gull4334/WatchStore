// src/routes/public.products.js
// A4 — GET /api/products
// A5 — GET /api/products/featured

const router       = require('express').Router();
const { supabase } = require('../config/supabase');
const R            = require('../utils/response');
const { validateQuery } = require('../middleware/validate');
const { productQuerySchema } = require('../validators/public.validators');

// A5 MUST be declared before A4 /:id wildcard (if added later)
// A5 — Featured product for homepage hero
router.get('/featured', async (_req, res) => {
  const { data, error } = await supabase
    .from('v_product_catalog')
    .select('*')
    .eq('status', 'active')
    .eq('is_featured', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    // Fallback: return first active product
    const { data: fallback, error: fbErr } = await supabase
      .from('v_product_catalog')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fbErr || !fallback) return R.notFound(res, 'No active products found');
    return R.success(res, fallback);
  }
  return R.success(res, data);
});

// A4 — Filterable product catalog
router.get('/', validateQuery(productQuerySchema), async (req, res) => {
  const { category, limit, offset } = req.query;

  let query = supabase
    .from('v_product_catalog')
    .select('*', { count: 'exact' })
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) {
    query = query.eq('category_slug', category);
  }

  const { data, error, count } = await query;
  if (error) return R.error(res, 'Failed to load products');

  return R.success(res, { data, total: count, limit, offset });
});

module.exports = router;
