const express          = require('express');
const router           = express.Router();
const c                = require('./orders.controller');
const { authenticate } = require('../../middleware/auth');

// Public
router.get('/track/:orderNumber', c.trackOrder);
router.post('/',                  c.createOrder);

// Admin
router.get('/',        authenticate, c.listOrders);
router.get('/:id',     authenticate, c.getOrder);
router.put('/:id/status', authenticate, c.updateOrderStatus);
router.delete('/:id',  authenticate, c.cancelOrder);

module.exports = router;
