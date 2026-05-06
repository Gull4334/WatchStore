const express          = require('express');
const router           = express.Router();
const c                = require('./discounts.controller');
const { authenticate } = require('../../middleware/auth');

router.post('/validate',  c.validateDiscount);          // public
router.get('/',           authenticate, c.listDiscounts);
router.post('/',          authenticate, c.createDiscount);
router.put('/:id',        authenticate, c.updateDiscount);

module.exports = router;
