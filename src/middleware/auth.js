const jwt      = require('jsonwebtoken');
const response = require('../utils/response');

const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.unauthorized(res, 'No token provided');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return response.unauthorized(res, 'Token expired');
    }
    return response.unauthorized(res, 'Invalid token');
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return response.unauthorized(res);
  if (!roles.includes(req.user.role)) {
    return response.forbidden(res, 'Insufficient permissions');
  }
  next();
};

module.exports = { authenticate, requireRole };
