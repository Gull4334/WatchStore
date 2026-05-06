const express                        = require('express');
const router                         = express.Router();
const controller                     = require('./auth.controller');
const validate                       = require('../../middleware/validate');
const { authenticate }               = require('../../middleware/auth');
const { loginSchema, changePasswordSchema } = require('./auth.schema');
const rateLimit                      = require('express-rate-limit');

// Brute-force protection on login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      5,
  message:  { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

router.post('/login',           loginLimiter, validate(loginSchema), controller.login);
router.post('/logout',          authenticate, controller.logout);
router.get('/me',               authenticate, controller.me);
router.put('/change-password',  authenticate, validate(changePasswordSchema), controller.changePassword);

module.exports = router;
