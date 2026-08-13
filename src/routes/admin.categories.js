// src/routes/admin.categories.js
// B22 — GET    /api/admin/categories
// B23 — POST   /api/admin/categories
// B24 — PUT    /api/admin/categories/:id
// B26 — POST   /api/admin/categories/:id/image
// B27 — DELETE /api/admin/categories/:id/image
// B28 — DELETE /api/admin/categories/:id

const router         = require('express').Router();
const { randomUUID } = require('crypto');
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { validate }   = require('../middleware/validate');
const { categorySchema } = require('../validators/admin.validators');
const { upload, handleUploadError } = require('../middleware/upload');

const IMAGE_BUCKET = 'category-images';

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

// B26 — Upload/replace a category's image
router.post('/:id/image', upload.single('image'), handleUploadError, async (req, res) => {
  const { id } = req.params;
  if (!req.file) return R.badRequest(res, 'Image file is required');

  const { data: existing, error: findErr } = await supabaseAdmin
    .from('categories')
    .select('id, image_url')
    .eq('id', id)
    .single();
  if (findErr || !existing) return R.notFound(res, 'Category not found');

  const ext = req.file.mimetype.split('/')[1];
  const filePath = `${id}/${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(IMAGE_BUCKET)
    .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
  if (uploadErr) {
    console.error('Category image upload error:', uploadErr);
    return R.error(res, 'Failed to upload image. Please try again.');
  }

  const { data: urlData } = supabaseAdmin.storage.from(IMAGE_BUCKET).getPublicUrl(filePath);

  const { data, error } = await supabaseAdmin
    .from('categories')
    .update({ image_url: urlData.publicUrl })
    .eq('id', id)
    .select('id, image_url')
    .single();
  if (error) return R.error(res, 'Failed to save category image');

  // Best-effort cleanup of the previous image
  const marker = `/object/public/${IMAGE_BUCKET}/`;
  if (existing.image_url?.includes(marker)) {
    const oldPath = existing.image_url.slice(existing.image_url.indexOf(marker) + marker.length);
    await supabaseAdmin.storage.from(IMAGE_BUCKET).remove([oldPath]);
  }

  return R.success(res, data);
});

// B27 — Remove a category's image
router.delete('/:id/image', async (req, res) => {
  const { id } = req.params;

  const { data: existing, error: findErr } = await supabaseAdmin
    .from('categories')
    .select('id, image_url')
    .eq('id', id)
    .single();
  if (findErr || !existing) return R.notFound(res, 'Category not found');

  await supabaseAdmin.from('categories').update({ image_url: null }).eq('id', id);

  const marker = `/object/public/${IMAGE_BUCKET}/`;
  if (existing.image_url?.includes(marker)) {
    const oldPath = existing.image_url.slice(existing.image_url.indexOf(marker) + marker.length);
    await supabaseAdmin.storage.from(IMAGE_BUCKET).remove([oldPath]);
  }

  return R.success(res, { deleted: true });
});

// B28 — Delete a category (blocked if any products still reference it,
// regardless of active/inactive status)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { data: existing, error: findErr } = await supabaseAdmin
    .from('categories')
    .select('id, name, image_url')
    .eq('id', id)
    .single();
  if (findErr || !existing) return R.notFound(res, 'Category not found');

  const { count } = await supabaseAdmin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);

  if ((count ?? 0) > 0) {
    return R.business(
      res,
      `Cannot delete "${existing.name}" — ${count} product${count === 1 ? '' : 's'} still belong to this category. Delete or move ${count === 1 ? 'it' : 'them'} first.`
    );
  }

  const { error } = await supabaseAdmin.from('categories').delete().eq('id', id);
  if (error) return R.error(res, 'Failed to delete category');

  const marker = `/object/public/${IMAGE_BUCKET}/`;
  if (existing.image_url?.includes(marker)) {
    const oldPath = existing.image_url.slice(existing.image_url.indexOf(marker) + marker.length);
    await supabaseAdmin.storage.from(IMAGE_BUCKET).remove([oldPath]);
  }

  await supabaseAdmin.from('activity_logs').insert({
    admin_id:   req.admin.id,
    event_type: 'category_deleted',
    description:`Category "${existing.name}" deleted`,
    metadata:   { category_id: id, name: existing.name },
  });

  return R.success(res, { deleted: true });
});

module.exports = router;
