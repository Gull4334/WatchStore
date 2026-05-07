// src/routes/admin.products.js
// B18 — GET   /api/admin/products
// B19 — POST  /api/admin/products
// B20 — PUT   /api/admin/products/:id
// B21 — PATCH /api/admin/products/:id/toggle-status

const router         = require('express').Router();
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { validate, validateQuery } = require('../middleware/validate');
const { productsQuerySchema, productSchema } = require('../validators/admin.validators');

// B18 — Full product list (all statuses for admin)
router.get('/', validateQuery(productsQuerySchema), async (req, res) => {
  const { category, status, search, low_stock, limit, offset } = req.query;

  let query = supabaseAdmin
    .from('v_product_catalog')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status)     query = query.eq('status', status);
  if (category)   query = query.eq('category_slug', category);
  if (search)     query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);

  if (low_stock) {
    const { data: settings } = await supabaseAdmin
      .from('settings').select('low_stock_threshold').single();
    const threshold = settings?.low_stock_threshold || 5;
    query = query.lte('stock_quantity', threshold).eq('status', 'active');
  }

  const { data, error, count } = await query;
  if (error) return R.error(res, 'Failed to load products');
  return R.success(res, { data, total: count, limit, offset });
});

// B19 — Create product
router.post('/', validate(productSchema), async (req, res) => {
  const productData = req.body;

  // If marking as featured, un-feature all others first
  if (productData.is_featured) {
    await supabaseAdmin
      .from('products')
      .update({ is_featured: false })
      .eq('is_featured', true);
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .insert(productData)
    .select('id, name, status, created_at')
    .single();

  if (error) {
    if (error.code === '23505') return R.conflict(res, 'A product with this SKU already exists');
    return R.error(res, 'Failed to create product');
  }

  await supabaseAdmin.from('activity_logs').insert({
    admin_id:   req.admin.id,
    event_type: 'product_created',
    description:`Product "${data.name}" created`,
    metadata:   { product_id: data.id, name: data.name },
  });

  return R.created(res, data);
});

// B20 — Update product (full PUT)
router.put('/:id', validate(productSchema), async (req, res) => {
  const { id } = req.params;
  const productData = req.body;

  if (productData.is_featured) {
    await supabaseAdmin
      .from('products')
      .update({ is_featured: false })
      .eq('is_featured', true)
      .neq('id', id);
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .update(productData)
    .eq('id', id)
    .select('id, name, status, updated_at')
    .single();

  if (error || !data) return R.notFound(res, 'Product not found');

  await supabaseAdmin.from('activity_logs').insert({
    admin_id:   req.admin.id,
    event_type: 'product_updated',
    description:`Product "${data.name}" updated`,
    metadata:   { product_id: id },
  });

  return R.success(res, data);
});

// B21 — Toggle product active/inactive
router.patch('/:id/toggle-status', async (req, res) => {
  const { id } = req.params;

  const { data: existing } = await supabaseAdmin
    .from('products')
    .select('id, name, status')
    .eq('id', id)
    .single();

  if (!existing) return R.notFound(res, 'Product not found');

  const newStatus = existing.status === 'active' ? 'inactive' : 'active';

  const { data, error } = await supabaseAdmin
    .from('products')
    .update({ status: newStatus })
    .eq('id', id)
    .select('id, status, updated_at')
    .single();

  if (error) return R.error(res, 'Failed to update product status');

  await supabaseAdmin.from('activity_logs').insert({
    admin_id:   req.admin.id,
    event_type: 'product_toggled',
    description:`Product "${existing.name}" set to ${newStatus}`,
    metadata:   { product_id: id, new_status: newStatus },
  });

  return R.success(res, data);
});

module.exports = router;
