// src/routes/admin.auth.js
// B1 — POST /api/admin/auth/login
// B2 — POST /api/admin/auth/logout
// B3 — PATCH /api/admin/auth/change-password

const router         = require('express').Router();
const bcrypt         = require('bcryptjs');
const jwt            = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');
const R              = require('../utils/response');
const { validate }   = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { loginSchema, changePasswordSchema } = require('../validators/admin.validators');

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '24h';

// B1 — Admin login
router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const { data: admin, error } = await supabaseAdmin
    .from('admins')
    .select('id, name, email, role, password_hash, is_active')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (error || !admin) {
    return R.error(res, 'Invalid email or password', 'UNAUTHORIZED', 401);
  }
  if (!admin.is_active) {
    return R.error(res, 'Account has been deactivated', 'FORBIDDEN', 403);
  }

  const passwordMatch = await bcrypt.compare(password, admin.password_hash);
  if (!passwordMatch) {
    return R.error(res, 'Invalid email or password', 'UNAUTHORIZED', 401);
  }

  // Generate JWT
  const token = jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  // Update last_login_at
  await supabaseAdmin
    .from('admins')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', admin.id);

  const expiresAt = new Date(Date.now() + parseDuration(JWT_EXPIRES));

  return R.success(res, {
    token,
    expires_at: expiresAt.toISOString(),
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
  });
});

// B2 — Logout (client-side token clearing; server logs the event)
router.post('/logout', requireAuth, async (req, res) => {
  // In a stateless JWT system, logout is handled client-side.
  // For token blacklisting, a Redis store would be used.
  return R.success(res, { message: 'Logged out successfully' });
});

// B3 — Change password
router.patch('/change-password', requireAuth, validate(changePasswordSchema), async (req, res) => {
  const { current_password, new_password } = req.body;
  const adminId = req.admin.id;

  const { data: admin } = await supabaseAdmin
    .from('admins')
    .select('password_hash')
    .eq('id', adminId)
    .single();

  const match = await bcrypt.compare(current_password, admin.password_hash);
  if (!match) {
    return R.badRequest(res, 'Current password is incorrect');
  }

  const newHash = await bcrypt.hash(new_password, 12);
  await supabaseAdmin
    .from('admins')
    .update({ password_hash: newHash })
    .eq('id', adminId);

  return R.success(res, { message: 'Password updated successfully' });
});

// Helper: parse duration strings like '24h', '7d' to milliseconds
function parseDuration(str) {
  const units = { h: 3600000, d: 86400000, m: 60000 };
  const match  = str.match(/^(\d+)([hdm])$/);
  if (!match) return 86400000; // default 24h
  return parseInt(match[1]) * (units[match[2]] || 3600000);
}

module.exports = router;
