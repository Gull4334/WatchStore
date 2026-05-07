// src/middleware/validate.js — Zod schema validation middleware

const R = require('../utils/response');

/**
 * validate(schema) — validates req.body against a Zod schema.
 * On failure returns 400 with field-level error details.
 */
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const details = result.error.errors.reduce((acc, e) => {
      acc[e.path.join('.')] = e.message;
      return acc;
    }, {});
    return R.badRequest(res, 'Validation failed', details);
  }
  req.body = result.data; // use coerced/transformed values
  next();
};

/**
 * validateQuery(schema) — same but for req.query.
 */
const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    const details = result.error.errors.reduce((acc, e) => {
      acc[e.path.join('.')] = e.message;
      return acc;
    }, {});
    return R.badRequest(res, 'Invalid query parameters', details);
  }
  req.query = result.data;
  next();
};

module.exports = { validate, validateQuery };
