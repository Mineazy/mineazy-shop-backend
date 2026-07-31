const express = require('express');
const multer = require('multer');
const Product = require('../models/Product');
const Category = require('../models/Category');
const catalogImporter = require('../utils/catalogImporter');
const { auth, authorize } = require('../middleware/auth');
const { isValidImageUrl } = require('../utils/productImageUtils');

const router = express.Router();

const MAX_CATALOG_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CATALOG_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (file.mimetype === 'application/json' || ext === 'json') {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'));
    }
  }
});

/**
 * Parse the incoming catalog. Accepts either:
 *  - a JSON body (application/json) containing the catalog object
 *  - a multipart file upload with field name "file"
 */
const getCatalogPayload = async (req) => {
  if (req.file) {
    return JSON.parse(req.file.buffer.toString('utf8'));
  }
  if (req.is('application/json')) {
    return req.body;
  }
  throw new Error('Send a JSON catalog body or a multipart upload with a "file" field');
};

// @route   POST /api/catalog/import
// @desc    Import/update the product catalog (categories + products)
// @access  Private (Admin only)
router.post('/import', auth, authorize('inventory_manager', 'super_admin'), upload.single('file'), async (req, res) => {
  try {
    const data = await getCatalogPayload(req);
    const mode = ['create_only', 'update_only', 'upsert'].includes(req.query.mode) ? req.query.mode : 'upsert';
    const dryRun = req.query.dryRun === 'true';

    const results = await catalogImporter.importCatalog(data, { mode, dryRun });

    const totalProducts = results.products.created + results.products.updated;
    const totalCategories = results.categories.created + results.categories.updated;

    res.json({
      success: results.success,
      mode,
      dryRun,
      message: dryRun
        ? `Dry run: ${results.categories.created} categories created, ${results.categories.updated} updated, ${results.products.created} products created, ${results.products.updated} updated`
        : `Catalog imported: ${results.categories.created} categories created, ${results.categories.updated} updated, ${results.products.created} products created, ${results.products.updated} updated`,
      results
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// @route   GET /api/catalog/export
// @desc    Export the full catalog (categories + products) as mineazy-catalog-v1
// @access  Private (Admin only)
router.get('/export', auth, authorize('inventory_manager', 'super_admin'), async (req, res) => {
  try {
    const [categories, products] = await Promise.all([
      Category.db.find({}),
      Product.db.find({})
    ]);

    const categoryById = new Map(categories.map(c => [c._id, c]));

    const catalog = {
      format: 'mineazy-catalog-v1',
      source: process.env.FRONTEND_URL || 'https://mineazy.co.zw',
      exportedAt: new Date().toISOString(),
      counts: {
        categories: categories.length,
        products: products.length
      },
      categories: categories.map(c => ({
        _id: c._id,
        name: c.name,
        slug: c.slug,
        description: c.description || '',
        parent: c.parent || null,
        sortOrder: c.sortOrder || 0,
        isActive: c.isActive !== false,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      })),
      products: products.map(p => {
        const { _id, name, slug, description, shortDescription, price, salePrice, sku,
                images, specifications, inStock, stockQuantity, weight, dimensions,
                tags, isActive, featured, viewCount, createdAt, updatedAt, category } = p;
        let catRef = null;
        if (category) {
          const catObj = categoryById.get(typeof category === 'object' ? category._id : category);
          catRef = catObj
            ? { _id: catObj._id, name: catObj.name, slug: catObj.slug }
            : (typeof category === 'object' ? category : null);
        }
        return {
          _id,
          name,
          slug,
          description,
          shortDescription,
          price,
          salePrice,
          sku,
          category: catRef,
          images: images || [],
          specifications: specifications || {},
          inStock: inStock !== false,
          stockQuantity: stockQuantity || 0,
          weight,
          dimensions,
          tags: tags || [],
          isActive: isActive !== false,
          featured: !!featured,
          viewCount: viewCount || 0,
          createdAt,
          updatedAt
        };
      })
    };

    if (req.query.format === 'file') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="mineazy-catalog-${new Date().toISOString().split('T')[0]}.json"`);
      return res.send(JSON.stringify(catalog, null, 2));
    }

    res.json(catalog);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/catalog/status
// @desc    Summary counts for the catalog
// @access  Private (Admin only)
router.get('/status', auth, authorize('inventory_manager', 'super_admin'), async (req, res) => {
  try {
    const [categories, products] = await Promise.all([
      Category.db.find({}),
      Product.db.find({})
    ]);

    const activeProducts = products.filter(p => p.isActive !== false);
    const inStockProducts = products.filter(p => p.inStock !== false && (p.stockQuantity || 0) > 0);
    const skus = new Set(products.filter(p => p.sku).map(p => p.sku));
    const slugs = new Set(products.filter(p => p.slug).map(p => p.slug));

    res.json({
      categories: categories.length,
      products: products.length,
      activeProducts: activeProducts.length,
      inStockProducts: inStockProducts.length,
      uniqueSkus: skus.size,
      duplicateSkus: products.length - skus.size,
      duplicateSlugs: products.length - slugs.size
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
