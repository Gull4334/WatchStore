// src/middleware/auth.js — JWT authentication guard for admin routes

const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');
const R = require('../utils/response');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * requireAuth — verifies the Bearer JWT and attaches admin info to req.admin.
 * Place on any route that needs an authenticated admin.
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return R.error(res, 'Missing Authorization header', 'UNAUTHORIZED', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify admin still exists and is active
    const { data: admin, error } = await supabaseAdmin
      .from('admins')
      .select('id, name, email, role, is_active')
      .eq('id', decoded.id)
      .single();

    if (error || !admin) {
      return R.error(res, 'Invalid or expired token', 'UNAUTHORIZED', 401);
    }
    if (!admin.is_active) {
      return R.error(res, 'Account has been deactivated', 'FORBIDDEN', 403);
    }

    req.admin = admin;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return R.error(res, 'Token has expired. Please login again.', 'UNAUTHORIZED', 401);
    }
    return R.error(res, 'Invalid token', 'UNAUTHORIZED', 401);
  }
};

/**
 * requireRole — must be used AFTER requireAuth.
 * Restricts route to specific admin roles.
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.admin?.role)) {
    return R.forbidden(res, `This action requires one of these roles: ${roles.join(', ')}`);
  }
  next();
};

module.exports = { requireAuth, requireRole };
