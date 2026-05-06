const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const db           = require('../../config/db');
const response     = require('../../utils/response');
const asyncHandler = require('../../utils/asyncHandler');

// POST /api/v1/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const result = await db.query(
    `SELECT id, name, email, password_hash, role, is_active
     FROM users WHERE email = $1 LIMIT 1`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    return response.unauthorized(res, 'Invalid email or password');
  }

  const user = result.rows[0];

  if (!user.is_active) {
    return response.unauthorized(res, 'Account is deactivated');
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    return response.unauthorized(res, 'Invalid email or password');
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  return response.success(res, {
    token,
    user: {
      id:    user.id,
      name:  user.name,
      email: user.email,
      role:  user.role,
    },
  }, 'Login successful');
});

// GET /api/v1/auth/me
const me = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT id, name, email, role, is_active, created_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );

  if (result.rows.length === 0) {
    return response.notFound(res, 'User not found');
  }

  return response.success(res, result.rows[0]);
});

// PUT /api/v1/auth/change-password
const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  const result = await db.query(
    `SELECT id, password_hash FROM users WHERE id = $1`,
    [req.user.id]
  );

  if (result.rows.length === 0) {
    return response.notFound(res, 'User not found');
  }

  const user = result.rows[0];
  const match = await bcrypt.compare(current_password, user.password_hash);

  if (!match) {
    return response.error(res, 'Current password is incorrect', 400);
  }

  const newHash = await bcrypt.hash(new_password, 12);

  await db.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [newHash, req.user.id]
  );

  return response.success(res, null, 'Password changed successfully');
});

// POST /api/v1/auth/logout
const logout = asyncHandler(async (req, res) => {
  // JWT is stateless — client drops the token
  // Future: add token blacklist here if needed
  return response.success(res, null, 'Logged out successfully');
});

module.exports = { login, me, changePassword, logout };
