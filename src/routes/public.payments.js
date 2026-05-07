// src/routes/public.payments.js
// A9 — POST /api/payments/screenshot

const router         = require('express').Router();
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { upload, handleUploadError } = require('../middleware/upload');
const { screenshotBodySchema } = require('../validators/public.validators');

// A9 — Upload payment screenshot
router.post(
  '/screenshot',
  upload.single('screenshot'),
  handleUploadError,
  async (req, res) => {
    // Validate body fields (order_id, transaction_ref)
    const parsed = screenshotBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const details = parsed.error.errors.reduce((a, e) => ({ ...a, [e.path.join('.')]: e.message }), {});
      return require('../utils/response').badRequest(res, 'Validation failed', details);
    }

    const { order_id, transaction_ref } = parsed.data;

    if (!req.file) {
      return R.badRequest(res, 'Screenshot file is required');
    }

    // Verify order exists and is in pending_payment status
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, whatsapp_number, payment_method, total_amount, status')
      .eq('id', order_id)
      .single();

    if (orderErr || !order) return R.notFound(res, 'Order not found');
    if (order.status !== 'pending_payment') {
      return R.business(res, `Cannot upload screenshot for order with status: ${order.status}`);
    }

    // Upload file to Supabase Storage (private bucket)
    const ext       = req.file.mimetype.split('/')[1];
    const filePath  = `${order_id}/${Date.now()}.${ext}`;
    const bucket    = 'payment-screenshots';

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(bucket)
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (uploadErr) {
      console.error('Storage upload error:', uploadErr);
      return R.error(res, 'Failed to upload screenshot. Please try again.');
    }

    // Get signed URL (valid for 7 days — admin will view it within that window)
    const { data: urlData } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(filePath, 60 * 60 * 24 * 7);

    const screenshot_url = urlData?.signedUrl || filePath;

    // Create payment record
    const { data: payment, error: payErr } = await supabaseAdmin
      .from('payments')
      .insert({
        order_id,
        method:          order.payment_method,
        amount:          order.total_amount,
        screenshot_url,
        transaction_ref: transaction_ref || null,
        status:          'pending_review',
      })
      .select('id, status')
      .single();

    if (payErr) {
      console.error('Payment record error:', payErr);
      return R.error(res, 'Failed to save payment record.');
    }

    // Update order status to payment_submitted
    await supabaseAdmin
      .from('orders')
      .update({ status: 'payment_submitted' })
      .eq('id', order_id);

    return R.created(res, {
      payment_id:    payment.id,
      screenshot_url,
      status:        payment.status,
      order_status:  'payment_submitted',
    });
  }
);

module.exports = router;
