const Joi = require('joi');

const createProductSchema = Joi.object({
  category_id:    Joi.string().uuid().allow(null, ''),
  name:           Joi.string().min(2).max(255).required(),
  slug:           Joi.string().min(2).max(255),
  description:    Joi.string().allow('', null),
  price:          Joi.number().min(0).required(),
  compare_price:  Joi.number().min(0).allow(null),
  stock_quantity: Joi.number().integer().min(0).default(0),
  sku:            Joi.string().max(100).allow('', null),
  brand:          Joi.string().max(100).allow('', null),
  is_featured:    Joi.boolean().default(false),
  is_active:      Joi.boolean().default(true),
});

const updateProductSchema = createProductSchema.fork(
  ['name', 'price'],
  (field) => field.optional()
);

const createCategorySchema = Joi.object({
  name:      Joi.string().min(2).max(100).required(),
  slug:      Joi.string().min(2).max(100),
  is_active: Joi.boolean().default(true),
});

module.exports = { createProductSchema, updateProductSchema, createCategorySchema };
