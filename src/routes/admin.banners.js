// src/routes/admin.banners.js
// GET    /api/admin/banners
// POST   /api/admin/banners
// PUT    /api/admin/banners/:id
// POST   /api/admin/banners/:id/image
// DELETE /api/admin/banners/:id/image
// DELETE /api/admin/banners/:id

const router         = require('express').Router();
const { randomUUID } = require('crypto');
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { validate }   = require('../middleware/validate');
const { bannerSlideSchema } = require('../validators/admin.validators');
const { upload, handleUploadError } = require('../middleware/upload');

const IMAGE_BUCKET = 'banner-images';

// All slides, in display order
router.get('/', async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('banner_slides')
    .select('id, heading, description, cta_text, cta_link, image_url, sort_order, status, created_at')
    .order('sort_order', { ascending: true });

  if (error) return R.error(res, 'Failed to load banner slides');
  return R.success(res, data);
});

// Create a slide (image added afterwards via the /image endpoint)
router.post('/', validate(bannerSlideSchema), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('banner_slides')
    .insert(req.body)
    .select('id, heading, status')
    .single();

  if (error) return R.error(res, 'Failed to create banner slide');
  return R.created(res, data);
});

// Update a slide
router.put('/:id', validate(bannerSlideSchema), async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from('banner_slides')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, heading, status, updated_at')
    .single();

  if (error || !data) return R.notFound(res, 'Banner slide not found');
  return R.success(res, data);
});

// Upload/replace a slide's image
router.post('/:id/image', upload.single('image'), handleUploadError, async (req, res) => {
  const { id } = req.params;
  if (!req.file) return R.badRequest(res, 'Image file is required');

  const { data: existing, error: findErr } = await supabaseAdmin
    .from('banner_slides')
    .select('id, image_url')
    .eq('id', id)
    .single();
  if (findErr || !existing) return R.notFound(res, 'Banner slide not found');

  const ext = req.file.mimetype.split('/')[1];
  const filePath = `${id}/${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(IMAGE_BUCKET)
    .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
  if (uploadErr) {
    console.error('Banner image upload error:', uploadErr);
    return R.error(res, 'Failed to upload image. Please try again.');
  }

  const { data: urlData } = supabaseAdmin.storage.from(IMAGE_BUCKET).getPublicUrl(filePath);

  const { data, error } = await supabaseAdmin
    .from('banner_slides')
    .update({ image_url: urlData.publicUrl })
    .eq('id', id)
    .select('id, image_url')
    .single();
  if (error) return R.error(res, 'Failed to save banner image');

  const marker = `/object/public/${IMAGE_BUCKET}/`;
  if (existing.image_url?.includes(marker)) {
    const oldPath = existing.image_url.slice(existing.image_url.indexOf(marker) + marker.length);
    await supabaseAdmin.storage.from(IMAGE_BUCKET).remove([oldPath]);
  }

  return R.success(res, data);
});

// Remove a slide's image
router.delete('/:id/image', async (req, res) => {
  const { id } = req.params;

  const { data: existing, error: findErr } = await supabaseAdmin
    .from('banner_slides')
    .select('id, image_url')
    .eq('id', id)
    .single();
  if (findErr || !existing) return R.notFound(res, 'Banner slide not found');

  await supabaseAdmin.from('banner_slides').update({ image_url: null }).eq('id', id);

  const marker = `/object/public/${IMAGE_BUCKET}/`;
  if (existing.image_url?.includes(marker)) {
    const oldPath = existing.image_url.slice(existing.image_url.indexOf(marker) + marker.length);
    await supabaseAdmin.storage.from(IMAGE_BUCKET).remove([oldPath]);
  }

  return R.success(res, { deleted: true });
});

// Delete a slide
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { data: existing, error: findErr } = await supabaseAdmin
    .from('banner_slides')
    .select('id, heading, image_url')
    .eq('id', id)
    .single();
  if (findErr || !existing) return R.notFound(res, 'Banner slide not found');

  const { error } = await supabaseAdmin.from('banner_slides').delete().eq('id', id);
  if (error) return R.error(res, 'Failed to delete banner slide');

  const marker = `/object/public/${IMAGE_BUCKET}/`;
  if (existing.image_url?.includes(marker)) {
    const oldPath = existing.image_url.slice(existing.image_url.indexOf(marker) + marker.length);
    await supabaseAdmin.storage.from(IMAGE_BUCKET).remove([oldPath]);
  }

  return R.success(res, { deleted: true });
});

module.exports = router;
