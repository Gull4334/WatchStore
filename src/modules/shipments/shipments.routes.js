const express          = require('express');
const router           = express.Router();
const c                = require('./shipments.controller');
const { authenticate } = require('../../middleware/auth');

router.get('/',                  authenticate, c.listShipments);
router.post('/',                 authenticate, c.createShipment);
router.put('/:id',               authenticate, c.updateShipment);
router.put('/:id/delivered',     authenticate, c.markDelivered);

module.exports = router;
