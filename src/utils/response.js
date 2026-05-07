// src/utils/response.js — Standardised API response helpers

const success = (res, data, statusCode = 200) => {
  return res.status(statusCode).json(data);
};

const created = (res, data) => success(res, data, 201);

const error = (res, message, code = 'INTERNAL_ERROR', statusCode = 500, details = {}) => {
  return res.status(statusCode).json({ error: { code, message, details } });
};

const notFound  = (res, msg = 'Resource not found')           => error(res, msg, 'NOT_FOUND',        404);
const badRequest= (res, msg, details = {})                    => error(res, msg, 'VALIDATION_ERROR', 400, details);
const forbidden = (res, msg = 'Forbidden')                    => error(res, msg, 'FORBIDDEN',         403);
const conflict  = (res, msg)                                  => error(res, msg, 'CONFLICT',          409);
const business  = (res, msg)                                  => error(res, msg, 'BUSINESS_RULE',     422);

module.exports = { success, created, error, notFound, badRequest, forbidden, conflict, business };
