const Joi = require('joi');

const createOrderSchema = Joi.object({
  // Customer info
  full_name:        Joi.string().min(2).max(150).required(),
  phone:            Joi.string().min(10).max(20).required(),
  email:            Joi.string().email().allow('', null),
  city:             Joi.string().min(2).max(100).required(),
  address:          Joi.string().min(5).required(),
  instagram_handle: Joi.string().max(100).allow('', null),

  // Items
  items: Joi.array().items(
    Joi.object({
      product_id: Joi.string().uuid().required(),
      quantity:   Joi.number().integer().min(1).required(),
    })
  ).min(1).required(),

  // Payment
  payment_method: Joi.string()
    .valid('meezan_bank', 'easypaisa', 'jazzcash', 'easypaisa_api', 'jazzcash_api', 'safepay')
    .required(),

  // Optional
  discount_code: Joi.string().max(50).allow('', null),
  notes:         Joi.string().max(500).allow('', null),
  source:        Joi.string().valid('website', 'instagram', 'whatsapp', 'manual').default('website'),
});

module.exports = { createOrderSchema };
