// src/middleware/upload.js — Multer config for payment screenshot uploads

const multer = require('multer');
const R      = require('../utils/response');

const MAX_MB     = parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10);
const ALLOWED    = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.memoryStorage(); // keep file in buffer; we push to Supabase Storage

const fileFilter = (_req, file, cb) => {
  if (ALLOWED.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: ${ALLOWED.join(', ')}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

// Error handler for multer errors — must be registered AFTER the route
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return R.badRequest(res, `File too large. Maximum size is ${MAX_MB}MB.`);
    }
    return R.badRequest(res, err.message);
  }
  if (err) {
    return R.badRequest(res, err.message);
  }
  next();
};

module.exports = { upload, handleUploadError };
