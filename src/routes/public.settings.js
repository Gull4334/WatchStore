// src/routes/public.settings.js
// A1 — GET /api/settings/public
// A2 — GET /api/settings/payment-accounts

const router  = require('express').Router();
const { supabase } = require('../config/supabase');
const R        = require('../utils/response');

// A1 — Public subset of settings (safe for frontend)
router.get('/public', async (_req, res) => {
  const { data, error } = await supabase
    .from('settings')
    .select('store_name, whatsapp_number, instagram_handle, shipping_fee, free_shipping_threshold, default_courier, ticker_text')
    .single();

  if (error) return R.error(res, 'Failed to load settings');
  return R.success(res, data);
});

// A2 — Payment account details for checkout
router.get('/payment-accounts', async (_req, res) => {
  const { data, error } = await supabase
    .from('settings')
    .select('meezan_account_no, meezan_iban, easypaisa_number, jazzcash_number')
    .single();

  if (error) return R.error(res, 'Failed to load payment accounts');

  return R.success(res, {
    meezan_bank: { account_no: data.meezan_account_no, iban: data.meezan_iban },
    easypaisa:   { number: data.easypaisa_number },
    jazzcash:    { number: data.jazzcash_number },
  });
});

module.exports = router;
