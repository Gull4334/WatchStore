const response = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // Joi validation errors
  if (err.isJoi) {
    return response.validationError(res, err.details.map(d => d.message));
  }

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505':
        return response.error(res, 'A record with this value already exists', 409);
      case '23503':
        return response.error(res, 'Referenced record does not exist', 400);
      case '23502':
        return response.error(res, 'Required field is missing', 400);
      default:
        console.error('DB Error code:', err.code, err.detail);
    }
  }

  return response.error(res, err.message || 'Internal server error', err.statusCode || 500);
};

const notFoundHandler = (req, res) => {
  return response.notFound(res, `Route ${req.method} ${req.path} not found`);
};

module.exports = { errorHandler, notFoundHandler };
