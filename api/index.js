// Vercel serverless entrypoint — wraps the Express app for @vercel/node.
// src/index.js (app.listen) is only used for local/traditional hosting.
module.exports = require('../src/app');
