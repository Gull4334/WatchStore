const db           = require('../../config/db');
const response     = require('../../utils/response');
const asyncHandler = require('../../utils/asyncHandler');

// Helper: auto-generate slug from name
const toSlug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// ─── CATEGORIES ──────────────────────────────────────────────────────────────

// GET /api/v1/categories
const listCategories = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT id, name, slug, is_active, created_at
     FROM categories
     WHERE is_active = true
     ORDER BY name ASC`
  );
  return response.success(res, result.rows);
});

// POST /api/v1/categories
const createCategory = asyncHandler(async (req, res) => {
  const { name, slug, is_active = true } = req.body;
  const finalSlug = slug || toSlug(name);

  const result = await db.query(
    `INSERT INTO categories (name, slug, is_active)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, finalSlug, is_active]
  );
  return response.created(res, result.rows[0], 'Category created');
});

// ─── PRODUCTS ────────────────────────────────────────────────────────────────

// GET /api/v1/products
const listProducts = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 20,
    category, brand,
    min_price, max_price,
    search, featured,
    sort = 'created_at', order = 'desc',
  } = req.query;

  const offset    = (parseInt(page) - 1) * parseInt(limit);
  const conditions = ['p.is_active = true'];
  const params     = [];
  let   pi         = 1;

  if (category)   { conditions.push(`c.slug = $${pi++}`);              params.push(category); }
  if (brand)      { conditions.push(`p.brand ILIKE $${pi++}`);         params.push(`%${brand}%`); }
  if (min_price)  { conditions.push(`p.price >= $${pi++}`);            params.push(min_price); }
  if (max_price)  { conditions.push(`p.price <= $${pi++}`);            params.push(max_price); }
  if (featured)   { conditions.push(`p.is_featured = $${pi++}`);       params.push(featured === 'true'); }
  if (search)     { conditions.push(`p.name ILIKE $${pi++}`);          params.push(`%${search}%`); }

  const allowedSort  = ['created_at', 'price', 'name', 'stock_quantity'];
  const allowedOrder = ['asc', 'desc'];
  const safeSort     = allowedSort.includes(sort)   ? sort  : 'created_at';
  const safeOrder    = allowedOrder.includes(order) ? order : 'desc';

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataQuery = `
    SELECT
      p.id, p.name, p.slug, p.brand, p.price, p.compare_price,
      p.stock_quantity, p.is_featured, p.created_at,
      c.name AS category_name, c.slug AS category_slug,
      (SELECT url FROM product_images WHERE product_id = p.id AND is_primary = true LIMIT 1) AS primary_image
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ${where}
    ORDER BY p.${safeSort} ${safeOrder}
    LIMIT $${pi++} OFFSET $${pi++}
  `;

  const countQuery = `
    SELECT COUNT(*) FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ${where}
  `;

  const [data, count] = await Promise.all([
    db.query(dataQuery, [...params, parseInt(limit), offset]),
    db.query(countQuery, params),
  ]);

  const total = parseInt(count.rows[0].count);

  return response.paginated(res, data.rows, {
    page:        parseInt(page),
    limit:       parseInt(limit),
    total,
    total_pages: Math.ceil(total / parseInt(limit)),
  });
});

// GET /api/v1/products/featured
const getFeatured = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT
       p.id, p.name, p.slug, p.brand, p.price, p.compare_price, p.stock_quantity,
       c.name AS category_name,
       (SELECT url FROM product_images WHERE product_id = p.id AND is_primary = true LIMIT 1) AS primary_image
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.is_active = true AND p.is_featured = true
     ORDER BY p.created_at DESC
     LIMIT 12`
  );
  return response.success(res, result.rows);
});

// GET /api/v1/products/:slug
const getProduct = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const productResult = await db.query(
    `SELECT
       p.*, c.name AS category_name, c.slug AS category_slug
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.slug = $1 AND p.is_active = true`,
    [slug]
  );

  if (productResult.rows.length === 0) {
    return response.notFound(res, 'Product not found');
  }

  const product = productResult.rows[0];

  const imagesResult = await db.query(
    `SELECT id, url, alt_text, sort_order, is_primary
     FROM product_images WHERE product_id = $1
     ORDER BY sort_order ASC`,
    [product.id]
  );

  product.images = imagesResult.rows;
  return response.success(res, product);
});

// POST /api/v1/products
const createProduct = asyncHandler(async (req, res) => {
  const {
    category_id, name, slug, description,
    price, compare_price, stock_quantity = 0,
    sku, brand, is_featured = false, is_active = true,
  } = req.body;

  const finalSlug = slug || toSlug(name);

  const result = await db.query(
    `INSERT INTO products
       (category_id, name, slug, description, price, compare_price,
        stock_quantity, sku, brand, is_featured, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [category_id || null, name, finalSlug, description || null,
     price, compare_price || null, stock_quantity,
     sku || null, brand || null, is_featured, is_active]
  );

  return response.created(res, result.rows[0], 'Product created');
});

// PUT /api/v1/products/:id
const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await db.query(`SELECT id FROM products WHERE id = $1`, [id]);
  if (existing.rows.length === 0) return response.notFound(res, 'Product not found');

  const fields  = [];
  const values  = [];
  let   pi      = 1;

  const allowed = [
    'category_id', 'name', 'slug', 'description', 'price',
    'compare_price', 'stock_quantity', 'sku', 'brand',
    'is_featured', 'is_active',
  ];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = $${pi++}`);
      values.push(req.body[key]);
    }
  }

  if (fields.length === 0) return response.error(res, 'No fields to update', 400);

  values.push(id);
  const result = await db.query(
    `UPDATE products SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${pi} RETURNING *`,
    values
  );

  return response.success(res, result.rows[0], 'Product updated');
});

// DELETE /api/v1/products/:id  (soft delete)
const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await db.query(
    `UPDATE products SET is_active = false, updated_at = NOW()
     WHERE id = $1 RETURNING id`,
    [id]
  );
  if (result.rows.length === 0) return response.notFound(res, 'Product not found');
  return response.success(res, null, 'Product archived');
});

// POST /api/v1/products/:id/images
const addProductImage = asyncHandler(async (req, res) => {
  const { id }                              = req.params;
  const { url, alt_text, sort_order = 0, is_primary = false } = req.body;

  if (!url) return response.error(res, 'Image URL is required', 400);

  // If this is primary, unset others
  if (is_primary) {
    await db.query(
      `UPDATE product_images SET is_primary = false WHERE product_id = $1`,
      [id]
    );
  }

  const result = await db.query(
    `INSERT INTO product_images (product_id, url, alt_text, sort_order, is_primary)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, url, alt_text || null, sort_order, is_primary]
  );

  return response.created(res, result.rows[0], 'Image added');
});

// DELETE /api/v1/products/:id/images/:imgId
const deleteProductImage = asyncHandler(async (req, res) => {
  const { id, imgId } = req.params;
  const result = await db.query(
    `DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING id`,
    [imgId, id]
  );
  if (result.rows.length === 0) return response.notFound(res, 'Image not found');
  return response.success(res, null, 'Image deleted');
});

module.exports = {
  listCategories, createCategory,
  listProducts, getFeatured, getProduct,
  createProduct, updateProduct, deleteProduct,
  addProductImage, deleteProductImage,
};
