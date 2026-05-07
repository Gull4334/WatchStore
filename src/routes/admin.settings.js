// src/routes/admin.settings.js
// B34 — GET /api/admin/settings
// B35 — PUT /api/admin/settings

const router         = require('express').Router();
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { validate }   = require('../middleware/validate');
const { settingsSchema } = require('../validators/admin.validators');

// B34 — Get full settings (admin view — includes all fields)
router.get('/', async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select(`
      store_name, whatsapp_number, instagram_handle, admin_email,
      meezan_account_no, meezan_iban, easypaisa_number, jazzcash_number,
      shipping_fee, free_shipping_threshold, default_courier, low_stock_threshold,
      ticker_text,
      wa_template_order_placed, wa_template_payment_confirmed,
      wa_template_payment_rejected, wa_template_dispatched, wa_template_delivered,
      updated_at
    `)
    .single();

  if (error) return R.error(res, 'Failed to load settings');
  return R.success(res, data);
});

// B35 — Update settings (upsert — partial updates supported)
router.put('/', validate(settingsSchema), async (req, res) => {
  const updates = req.body;

  // Get current settings row ID
  const { data: current } = await supabaseAdmin
    .from('settings')
    .select('id')
    .single();

  if (!current) return R.error(res, 'Settings not initialised. Run the DB seed first.');

  const { error } = await supabaseAdmin
    .from('settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', current.id);

  if (error) return R.error(res, 'Failed to update settings');

  await supabaseAdmin.from('activity_logs').insert({
    admin_id:   req.admin.id,
    event_type: 'settings_updated',
    description:'Store settings updated',
    metadata:   { fields_updated: Object.keys(updates), updated_by: req.admin.email },
  });

  return R.success(res, { message: 'Settings updated successfully', updated_at: new Date().toISOString() });
});

module.exports = router;
