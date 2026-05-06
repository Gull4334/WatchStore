const response = require('../utils/response');

/**
 * Validates req.body against a Joi schema.
 * Usage: router.post('/path', validate(schema), controller)
 */
const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errors = error.details.map(d => d.message.replace(/"/g, "'"));
    return response.validationError(res, errors);
  }

  next();
};

module.exports = validate;
