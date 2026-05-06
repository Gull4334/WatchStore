const express          = require('express');
const router           = express.Router();
const c                = require('./analytics.controller');
const { authenticate } = require('../../middleware/auth');

router.get('/summary',                    authenticate, c.getSummary);
router.get('/orders-by-day',              authenticate, c.getOrdersByDay);
router.get('/top-products',               authenticate, c.getTopProducts);
router.get('/orders-by-status',           authenticate, c.getOrdersByStatus);
router.get('/revenue-by-payment-method',  authenticate, c.getRevenueByPaymentMethod);

module.exports = router;
