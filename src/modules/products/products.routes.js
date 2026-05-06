const express      = require('express');
const router       = express.Router();
const c            = require('./products.controller');
const validate     = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const {
  createProductSchema,
  updateProductSchema,
  createCategorySchema,
} = require('./products.schema');

// ── Categories ──────────────────────────────────────────────
router.get('/categories',         c.listCategories);
router.post('/categories',        authenticate, validate(createCategorySchema), c.createCategory);

// ── Products ────────────────────────────────────────────────
router.get('/',                   c.listProducts);
router.get('/featured',           c.getFeatured);
router.get('/:slug',              c.getProduct);
router.post('/',                  authenticate, validate(createProductSchema), c.createProduct);
router.put('/:id',                authenticate, validate(updateProductSchema), c.updateProduct);
router.delete('/:id',             authenticate, c.deleteProduct);

// ── Product Images ──────────────────────────────────────────
router.post('/:id/images',        authenticate, c.addProductImage);
router.delete('/:id/images/:imgId', authenticate, c.deleteProductImage);

module.exports = router;
