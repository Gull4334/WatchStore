const express          = require('express');
const router           = express.Router();
const c                = require('./payments.controller');
const { authenticate } = require('../../middleware/auth');

// Public
router.get('/methods',        c.listPaymentMethods);
router.post('/submit',        c.submitPayment);

// Admin
router.get('/',               authenticate, c.listPayments);
router.get('/:id',            authenticate, c.getPayment);
router.post('/:id/confirm',   authenticate, c.confirmPayment);
router.post('/:id/reject',    authenticate, c.rejectPayment);

module.exports = router;
