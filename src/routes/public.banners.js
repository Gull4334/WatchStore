// src/routes/public.banners.js
// GET /api/banners — active homepage banner slides, in display order

const router     = require('express').Router();
const { supabase } = require('../config/supabase');
const R          = require('../utils/response');

router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('banner_slides')
    .select('id, heading, description, cta_text, cta_link, image_url, sort_order')
    .eq('status', 'active')
    .not('image_url', 'is', null)
    .order('sort_order', { ascending: true });

  if (error) return R.error(res, 'Failed to load banner slides');
  return R.success(res, data);
});

module.exports = router;
