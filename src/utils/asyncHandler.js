/**
 * Wraps async route handlers so unhandled promise rejections
 * are forwarded to Express error middleware automatically.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
