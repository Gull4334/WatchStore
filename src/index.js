// src/index.js — Server entry point

require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║    CASIO SOCIETY API                 ║
  ║    Running on port ${PORT}              ║
  ║    ENV: ${(process.env.NODE_ENV || 'development').padEnd(14)}         ║
  ╚══════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});
