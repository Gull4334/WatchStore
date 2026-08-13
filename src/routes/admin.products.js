// src/routes/admin.products.js
// B18 — GET   /api/admin/products
// B19 — POST  /api/admin/products
// B20 — PUT   /api/admin/products/:id
// B21 — PATCH /api/admin/products/:id/toggle-status
// B22 — POST   /api/admin/products/images/upload  (cover image for a new, not-yet-created product)
// B23 — GET    /api/admin/products/:id/images
// B24 — POST   /api/admin/products/:id/images      (add gallery images)
// B25 — DELETE /api/admin/products/:id/images/:imageId

const router         = require('express').Router();
const { randomUUID } = require('crypto');
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { validate, validateQuery } = require('../middleware/validate');
const { productsQuerySchema, productSchema } = require('../validators/admin.validators');
const { upload, handleUploadError } = require('../middleware/upload');

const IMAGE_BUCKET = 'product-images';

async function uploadImageFile(file, pathPrefix) {
  const ext = file.mimetype.split('/')[1];
  const filePath = `${pathPrefix}/${Date.now()}-${randomUUID()}.${ext}`;
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(IMAGE_BUCKET)
    .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (uploadErr) throw uploadErr;
  const { data } = supabaseAdmin.storage.from(IMAGE_BUCKET).getPublicUrl(filePath);
  return { url: data.publicUrl, path: filePath };
}

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

  // Register the cover image (uploaded via /images/upload before creation)
  // as the first gallery row so it shows up when editing.
  await supabaseAdmin.from('product_images').insert({
    product_id: data.id,
    image_url:  productData.image_url,
    sort_order: 0,
  });

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

// B26 — Permanently delete a product
// order_items.product_id is a soft reference (ON DELETE SET NULL, with
// product_name already snapshotted), so this is safe even for products
// that have been ordered before — order history is preserved either way.
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { data: existing } = await supabaseAdmin
    .from('products')
    .select('id, name')
    .eq('id', id)
    .single();

  if (!existing) return R.notFound(res, 'Product not found');

  // Clean up gallery images from storage before the DB rows cascade-delete
  const { data: images } = await supabaseAdmin
    .from('product_images')
    .select('image_url')
    .eq('product_id', id);

  const marker = `/object/public/${IMAGE_BUCKET}/`;
  const paths = (images || [])
    .map(img => img.image_url.includes(marker) ? img.image_url.slice(img.image_url.indexOf(marker) + marker.length) : null)
    .filter(Boolean);
  if (paths.length) {
    await supabaseAdmin.storage.from(IMAGE_BUCKET).remove(paths);
  }

  const { error } = await supabaseAdmin.from('products').delete().eq('id', id);
  if (error) return R.error(res, 'Failed to delete product');

  await supabaseAdmin.from('activity_logs').insert({
    admin_id:   req.admin.id,
    event_type: 'product_deleted',
    description:`Product "${existing.name}" deleted`,
    metadata:   { product_id: id, name: existing.name },
  });

  return R.success(res, { deleted: true });
});

// B22 — Upload a standalone image (used for the cover image while creating
// a brand-new product, before it has an id to attach gallery rows to)
router.post('/images/upload', upload.single('image'), handleUploadError, async (req, res) => {
  if (!req.file) return R.badRequest(res, 'Image file is required');
  try {
    const { url } = await uploadImageFile(req.file, 'staging');
    return R.created(res, { url });
  } catch (err) {
    console.error('Product image upload error:', err);
    return R.error(res, 'Failed to upload image. Please try again.');
  }
});

// B23 — List a product's gallery images
router.get('/:id/images', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabaseAdmin
    .from('product_images')
    .select('id, image_url, sort_order, created_at')
    .eq('product_id', id)
    .order('sort_order', { ascending: true });

  if (error) return R.error(res, 'Failed to load product images');
  return R.success(res, data || []);
});

// B24 — Add one or more images to a product's gallery
router.post('/:id/images', upload.array('images', 10), handleUploadError, async (req, res) => {
  const { id } = req.params;
  if (!req.files?.length) return R.badRequest(res, 'At least one image file is required');

  const { data: product, error: pErr } = await supabaseAdmin
    .from('products')
    .select('id, image_url')
    .eq('id', id)
    .single();
  if (pErr || !product) return R.notFound(res, 'Product not found');

  const { data: existing } = await supabaseAdmin
    .from('product_images')
    .select('sort_order')
    .eq('product_id', id)
    .order('sort_order', { ascending: false })
    .limit(1);
  let nextSort = (existing?.[0]?.sort_order ?? -1) + 1;

  const inserted = [];
  try {
    for (const file of req.files) {
      const { url } = await uploadImageFile(file, id);
      inserted.push({ product_id: id, image_url: url, sort_order: nextSort++ });
    }
  } catch (err) {
    console.error('Product gallery upload error:', err);
    return R.error(res, 'Failed to upload one or more images. Please try again.');
  }

  const { data: rows, error: insErr } = await supabaseAdmin
    .from('product_images')
    .insert(inserted)
    .select('id, image_url, sort_order, created_at');

  if (insErr) return R.error(res, 'Failed to save uploaded images');

  // Keep products.image_url synced to the first (cover) gallery image
  const { data: cover } = await supabaseAdmin
    .from('product_images')
    .select('image_url')
    .eq('product_id', id)
    .order('sort_order', { ascending: true })
    .limit(1)
    .single();
  if (cover?.image_url && cover.image_url !== product.image_url) {
    await supabaseAdmin.from('products').update({ image_url: cover.image_url }).eq('id', id);
  }

  return R.created(res, rows);
});

// B25 — Delete a single gallery image
router.delete('/:id/images/:imageId', async (req, res) => {
  const { id, imageId } = req.params;

  const { count } = await supabaseAdmin
    .from('product_images')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', id);

  if ((count ?? 0) <= 1) {
    return R.business(res, 'A product must have at least one image. Add another before deleting this one.');
  }

  const { data: img, error: findErr } = await supabaseAdmin
    .from('product_images')
    .select('id, image_url')
    .eq('id', imageId)
    .eq('product_id', id)
    .single();
  if (findErr || !img) return R.notFound(res, 'Image not found');

  const { error: delErr } = await supabaseAdmin.from('product_images').delete().eq('id', imageId);
  if (delErr) return R.error(res, 'Failed to delete image');

  // Best-effort storage cleanup — derive the storage path from the public URL
  const marker = `/object/public/${IMAGE_BUCKET}/`;
  const idx = img.image_url.indexOf(marker);
  if (idx !== -1) {
    const path = img.image_url.slice(idx + marker.length);
    await supabaseAdmin.storage.from(IMAGE_BUCKET).remove([path]);
  }

  // If the deleted image was the cover, promote the new first image
  const { data: product } = await supabaseAdmin.from('products').select('image_url').eq('id', id).single();
  if (product?.image_url === img.image_url) {
    const { data: newCover } = await supabaseAdmin
      .from('product_images')
      .select('image_url')
      .eq('product_id', id)
      .order('sort_order', { ascending: true })
      .limit(1)
      .single();
    if (newCover?.image_url) {
      await supabaseAdmin.from('products').update({ image_url: newCover.image_url }).eq('id', id);
    }
  }

  return R.success(res, { deleted: true });
});

module.exports = router;
