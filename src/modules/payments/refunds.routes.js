const express          = require('express');
const router           = express.Router();
const c                = require('./refunds.controller');
const { authenticate } = require('../../middleware/auth');

router.get('/',                authenticate, c.listRefunds);
router.post('/',               authenticate, c.createRefund);
router.put('/:id/approve',     authenticate, c.approveRefund);
router.put('/:id/process',     authenticate, c.processRefund);

module.exports = router;
