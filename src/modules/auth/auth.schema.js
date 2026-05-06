const Joi = require('joi');

const loginSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const changePasswordSchema = Joi.object({
  current_password: Joi.string().required(),
  new_password:     Joi.string().min(8).required(),
  confirm_password: Joi.string().valid(Joi.ref('new_password')).required()
    .messages({ 'any.only': 'Passwords do not match' }),
});

module.exports = { loginSchema, changePasswordSchema };
