// routes/products.js - Updated version with Cloudinary support
const express = require('express');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { auth, authorize } = require('../middleware/auth');
const { productValidation } = require('../middleware/validation');
const multer = require('multer');
const path = require('path');
const csvImporter = require('../utils/csvImporter');
const fs = require('fs');
const fsp = require('fs').promises;
const { sanitizeProductRecord, sanitizeProductImages, isValidImageUrl } = require('../utils/productImageUtils');
const MongoShim = require('../utils/mongoshim');

const router = express.Router();
const MAX_BULK_IMAGE_FILES = 20;
const MAX_PRODUCT_IMAGE_FILES = 10;

const parseJsonArrayField = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [value];
  }
};

// Waterfall storage: Supabase → Cloudinary → local disk
const cloudinaryService = require('../utils/cloudinaryService');
const { uploadImage: waterfallUpload, uploadProductImages, uploadProductImagesBulk } = cloudinaryService;
const upload = uploadProductImages; // memory-storage multer, feed buffer to waterfallUpload
const USE_CLOUDINARY = !!process.env.CLOUDINARY_CLOUD_NAME; // kept for delete logic

// CSV upload middleware (always local for processing)
const csvStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/csv/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `products-import-${Date.now()}.csv`);
  }
});

const csvUpload = multer({ 
  storage: csvStorage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /csv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) return cb(null, true);
    cb(new Error('Only CSV files allowed'));
  }
});

const exportableProductFields = [
  'name', 'description', 'shortDescription', 'price', 'salePrice', 'sku',
  'category', 'stockQuantity', 'weight', 'dimensions', 'tags',
  'specifications', 'images', 'featured', 'isActive', 'inStock',
  'metaTitle', 'metaDescription', 'metaKeywords'
];

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) return '';

  const stringValue = String(value);
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

const normalizeObjectValue = (value) => {
  if (!value) return '';

  if (value instanceof Map) {
    return JSON.stringify(Object.fromEntries(value));
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return value;
};

const getExportValue = (product, field) => {
  switch (field) {
    case 'category':
      return product.category?.name || '';
    case 'tags':
    case 'images':
      return Array.isArray(product[field]) ? product[field].join(',') : '';
    case 'dimensions':
    case 'specifications':
      return normalizeObjectValue(product[field]);
    case 'price':
    case 'salePrice':
    case 'weight':
      return product[field] === null || product[field] === undefined ? '' : Number(product[field]).toFixed(2);
    case 'stockQuantity':
      return product.stockQuantity ?? 0;
    case 'featured':
    case 'isActive':
    case 'inStock':
      return product[field] === true ? 'true' : 'false';
    default:
      return product[field] ?? '';
  }
};

const buildAdminProductQuery = (filters) => {
  const { category, minPrice, maxPrice, inStock, featured, isActive, search } = filters;
  const query = {};

  if (category) {
    query.category = category;
  }

  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = parseFloat(minPrice);
    if (maxPrice) query.price.$lte = parseFloat(maxPrice);
  }

  if (inStock === 'true') {
    query.inStock = true;
    query.stockQuantity = { $gt: 0 };
  } else if (inStock === 'false') {
    query.$or = [{ inStock: false }, { stockQuantity: { $lte: 0 } }];
  }

  if (featured === 'true') {
    query.featured = true;
  } else if (featured === 'false') {
    query.featured = false;
  }

  if (isActive === 'true') {
    query.isActive = true;
  } else if (isActive === 'false') {
    query.isActive = false;
  }

  if (search) {
    const searchRegex = new RegExp(search, 'i');
    query.$and = [
      ...(query.$and || []),
      {
        $or: [
          { name: searchRegex },
          { description: searchRegex },
          { shortDescription: searchRegex },
          { tags: { $in: [searchRegex] } },
          { sku: searchRegex }
        ]
      }
    ];
  }

  return query;
};

// @route   GET /api/products
// @desc    Get products with filtering and pagination
// @access  Public
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      minPrice,
      maxPrice,
      inStock,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      featured
    } = req.query;

    // Build query
    const query = { isActive: true };

    if (category) {
      query.category = category;
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    if (inStock === 'true') {
      query.inStock = true;
      query.stockQuantity = { $gt: 0 };
    }

    if (featured === 'true') {
      query.featured = true;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { shortDescription: searchRegex },
        { tags: { $in: [searchRegex] } },
        { sku: searchRegex }
      ];
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const products = await Product.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum);
    await MongoShim.populate(products, 'category', Category, 'name slug');

    const total = await Product.countDocuments(query);

    res.json({
      products: products.map(sanitizeProductRecord),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/products/search
// @desc    Advanced product search
// @access  Public
router.get('/search', async (req, res) => {
  try {
    const { q, category, tags, specifications } = req.query;

    const query = { isActive: true };

    if (q) {
      query.$text = { $search: q };
    }

    if (category) {
      query.category = category;
    }

    if (tags) {
      const tagArray = tags.split(',');
      query.tags = { $in: tagArray };
    }

    if (specifications) {
      // Handle specification search
      const specQuery = JSON.parse(specifications);
      Object.keys(specQuery).forEach(key => {
        query[`specifications.${key}`] = new RegExp(specQuery[key], 'i');
      });
    }

    const products = await Product.find(query).limit(20);
    await MongoShim.populate(products, 'category', Category, 'name slug');

    res.json(products.map(sanitizeProductRecord));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/products/storage-status
// @desc    Check storage configuration status
// @access  Private (Admin only)
router.get('/storage-status', auth, authorize('inventory_manager', 'super_admin'), (req, res) => {
  res.json({
    storageType: 'waterfall',
    primaryProvider: 'supabase',
    cloudinaryConfigured: !!process.env.CLOUDINARY_CLOUD_NAME,
    supabaseConfigured: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseBucket: cloudinaryService.SUPABASE_BUCKET,
    localFallbackEnabled: cloudinaryService.ALLOW_LOCAL_UPLOAD_FALLBACK,
    uploadPath: USE_CLOUDINARY ? 'Cloudinary CDN' : '/uploads/products/',
    maxBulkFilesPerRequest: MAX_BULK_IMAGE_FILES,
    maxFileSize: process.env.MAX_FILE_SIZE || 5242880,
    warning: cloudinaryService.ALLOW_LOCAL_UPLOAD_FALLBACK
      ? 'Local storage fallback is enabled. On Render, local files are ephemeral and should not be relied on in production.'
      : null
  });
});

// @route   GET /api/products/export
// @desc    Export products to CSV
// @access  Private (Admin only)
router.get('/export', auth, authorize('inventory_manager', 'super_admin'), async (req, res) => {
  try {
    const requestedFields = String(req.query.fields || '')
      .split(',')
      .map(field => field.trim())
      .filter(field => exportableProductFields.includes(field));
    const fields = requestedFields.length > 0 ? requestedFields : exportableProductFields;

    const query = buildAdminProductQuery(req.query);
    const products = await Product.find(query)
      .sort({ createdAt: -1 });
    await MongoShim.populate(products, 'category', Category, 'name slug');

    const rows = [
      fields.map(escapeCsvValue).join(','),
      ...products.map(product => (
        fields.map(field => escapeCsvValue(getExportValue(product, field))).join(',')
      ))
    ];

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `products-export-${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Total-Products', String(products.length));
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Total-Products');
    res.send(rows.join('\n'));
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ message: 'Failed to export products', error: error.message });
  }
});

// @route   GET /api/products/:id
// @desc    Get single product (by _id or slug)
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    let product = await Product.findById(req.params.id);
    if (!product) {
      product = await Product.findOne({ slug: req.params.id });
    }
    if (product) {
      await MongoShim.populate(product, 'category', Category, 'name slug');
    }

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Increment view count
    product.viewCount += 1;
    await Product.update({ _id: product._id }, product);

    res.json(sanitizeProductRecord(product));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/products/:id/related
// @desc    Get related products
// @access  Public
router.get('/:id/related', async (req, res) => {
  try {
    let product = await Product.findById(req.params.id);
    if (!product) {
      product = await Product.findOne({ slug: req.params.id });
    }
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const relatedProducts = await Product.find({
      _id: { $ne: product._id },
      category: product.category,
      isActive: true
    }).limit(4);
    await MongoShim.populate(relatedProducts, 'category', Category, 'name slug');

    res.json(relatedProducts.map(sanitizeProductRecord));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/products
// @desc    Create product
// @access  Private (Admin only)
router.post('/', auth, authorize('inventory_manager', 'super_admin'), upload.array('images', MAX_PRODUCT_IMAGE_FILES), productValidation.create, async (req, res) => {
  try {
    const {
      name, description, shortDescription, price, salePrice, sku,
      category, stockQuantity, weight, dimensions, tags, specifications,
      metaTitle, metaDescription, metaKeywords
    } = req.body;

    // Check if category exists
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(400).json({ message: 'Category not found' });
    }

    const productData = {
      name,
      description,
      shortDescription,
      price: parseFloat(price),
      salePrice: salePrice ? parseFloat(salePrice) : undefined,
      sku: sku.toUpperCase(),
      category,
      stockQuantity: parseInt(stockQuantity) || 0,
      weight: weight ? parseFloat(weight) : undefined,
      dimensions: dimensions ? JSON.parse(dimensions) : undefined,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      specifications: specifications ? JSON.parse(specifications) : {},
      metaTitle,
      metaDescription,
      metaKeywords
    };

    // Upload images through waterfall: Supabase → Cloudinary → local
    if (req.files && req.files.length > 0) {
      const results = await Promise.all(
        req.files.map(file => waterfallUpload(file.buffer, file.originalname, 'products'))
      );
      productData.images = sanitizeProductImages(results.map(r => r.url));
      console.log('📸 Images stored:', productData.images);
    }

    const product = await Product.insert(productData);

    await MongoShim.populate(product, 'category', Category, 'name slug');

    res.status(201).json({
      message: 'Product created successfully',
      product,
      storageType: 'waterfall'
    });
  } catch (error) {
    console.error('Product creation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/products/:id
// @desc    Update product
// @access  Private (Admin only)
router.put('/:id', auth, authorize('inventory_manager', 'super_admin'), upload.array('images', MAX_PRODUCT_IMAGE_FILES), async (req, res) => {
  try {
    const {
      name, description, shortDescription, price, salePrice, sku,
      category, stockQuantity, weight, dimensions, tags, specifications, isActive,
      removeImages, // Array of image URLs to remove
      replaceImages,
      existingImageUrls,
      externalImageUrl,
      metaTitle, metaDescription, metaKeywords
    } = req.body;

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Update fields
    if (name) product.name = name;
    if (description) product.description = description;
    if (shortDescription) product.shortDescription = shortDescription;
    if (price) product.price = parseFloat(price);
    if (salePrice !== undefined) product.salePrice = salePrice ? parseFloat(salePrice) : null;
    if (sku) product.sku = sku.toUpperCase();
    if (category) product.category = category;
    if (stockQuantity !== undefined) product.stockQuantity = parseInt(stockQuantity);
    if (weight !== undefined) product.weight = weight ? parseFloat(weight) : null;
    if (dimensions) product.dimensions = JSON.parse(dimensions);
    if (tags) product.tags = tags.split(',').map(tag => tag.trim());
    if (specifications) product.specifications = JSON.parse(specifications);
    if (isActive !== undefined) product.isActive = isActive;
    if (metaTitle !== undefined) product.metaTitle = metaTitle;
    if (metaDescription !== undefined) product.metaDescription = metaDescription;
    if (metaKeywords !== undefined) product.metaKeywords = metaKeywords;

    if (replaceImages === 'true' || replaceImages === true) {
      product.images = [];
    }

    const imagesToRemove = parseJsonArrayField(removeImages);

    // Handle image removal
    if (imagesToRemove.length > 0) {
      // If using Cloudinary, delete from cloud
      if (USE_CLOUDINARY) {
        const cloudinaryService = require('../utils/cloudinaryService');
        for (const imageUrl of imagesToRemove) {
          try {
            // Extract public_id from Cloudinary URL
            const matches = imageUrl.match(/upload\/(?:v\d+\/)?(.*?)(?:\.[^.]+)?$/);
            if (matches && matches[1]) {
              await cloudinaryService.deleteImage(matches[1]);
              console.log('🗑️ Deleted from Cloudinary:', matches[1]);
            }
          } catch (error) {
            console.error('Error deleting image from Cloudinary:', error);
          }
        }
      }
      // Remove from product images array
      product.images = product.images.filter(img => !imagesToRemove.includes(img));
    }

    const selectedExistingUrls = parseJsonArrayField(existingImageUrls).filter(isValidImageUrl);
    const externalUrls = externalImageUrl && isValidImageUrl(externalImageUrl)
      ? [externalImageUrl.trim()]
      : [];

    // Upload new images through waterfall: Supabase → Cloudinary → local
    if (req.files && req.files.length > 0) {
      const results = await Promise.all(
        req.files.map(file => waterfallUpload(file.buffer, file.originalname, 'products'))
      );
      product.images = sanitizeProductImages([
        ...(Array.isArray(product.images) ? product.images : []),
        ...results.map(r => r.url)
      ]);
      console.log('📸 New images stored:', results.map(r => r.url));
    }

    if (selectedExistingUrls.length > 0 || externalUrls.length > 0) {
      product.images = sanitizeProductImages([
        ...(Array.isArray(product.images) ? product.images : []),
        ...selectedExistingUrls,
        ...externalUrls
      ]);
    }

    await Product.update({ _id: product._id }, product);
    await MongoShim.populate(product, 'category', Category, 'name slug');

    res.json({
      message: 'Product updated successfully',
      product,
      storageType: 'waterfall'
    });
  } catch (error) {
    console.error('Product update error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/products/:id
// @desc    Delete product
// @access  Private (Admin only)
router.delete('/:id', auth, authorize('inventory_manager', 'super_admin'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // If using Cloudinary, delete images from cloud
    if (USE_CLOUDINARY && product.images.length > 0) {
      const cloudinaryService = require('../utils/cloudinaryService');
      console.log('🗑️ Deleting Cloudinary images for product:', product.name);
      
      for (const imageUrl of product.images) {
        try {
          // Extract public_id from Cloudinary URL
          const matches = imageUrl.match(/upload\/(?:v\d+\/)?(.*?)(?:\.[^.]+)?$/);
          if (matches && matches[1]) {
            await cloudinaryService.deleteImage(matches[1]);
            console.log('✅ Deleted from Cloudinary:', matches[1]);
          }
        } catch (error) {
          console.error('Error deleting image from Cloudinary:', error);
        }
      }
    } else if (!USE_CLOUDINARY && product.images.length > 0) {
      // Optionally delete local files
      for (const imagePath of product.images) {
        try {
          const fullPath = path.join(__dirname, '..', imagePath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log('✅ Deleted local file:', imagePath);
          }
        } catch (error) {
          console.error('Error deleting local file:', error);
        }
      }
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({ 
      message: 'Product deleted successfully',
      deletedProduct: {
        id: product._id,
        name: product.name,
        sku: product.sku
      }
    });
  } catch (error) {
    console.error('Product deletion error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/products/bulk-import
// @desc    Bulk import/update products from CSV
// @access  Private (Admin only)
router.post('/bulk-import', auth, authorize('inventory_manager', 'super_admin'), csvUpload.single('csv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'CSV file is required' });
    }

    // Get import options from request body
    const updateExisting = req.body.updateExisting !== 'false'; // Default true
    const fieldsToUpdate = req.body.fieldsToUpdate ? 
      req.body.fieldsToUpdate.split(',').map(f => f.trim()) : 
      []; // Empty array = update all provided fields
    const concurrency = Math.min(Math.max(parseInt(req.body.concurrency) || 5, 1), 20);

    console.log('📊 Processing CSV import with options:', {
      file: req.file.path,
      updateExisting,
      fieldsToUpdate: fieldsToUpdate.length ? fieldsToUpdate : 'all',
      concurrency
    });

    const results = await csvImporter.importProducts(
      req.file.path, 
      updateExisting, 
      fieldsToUpdate,
      { concurrency }
    );

    await fsp.unlink(req.file.path);
    console.log('🧹 Cleaned up CSV file');

    if (results.success) {
      const message = [];
      if (results.imported > 0) message.push(`${results.imported} products created`);
      if (results.updated > 0) message.push(`${results.updated} products updated`);
      if (results.skipped.length > 0) message.push(`${results.skipped.length} skipped`);
      if (results.errors.length > 0) message.push(`${results.errors.length} errors`);

      res.json({
        message: `Import completed: ${message.join(', ')}`,
        results
      });
    } else {
      res.status(400).json({
        message: 'Import failed',
        results
      });
    }
  } catch (error) {
    console.error('CSV import error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      await fsp.unlink(req.file.path);
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/products/import/template
// @desc    Get CSV import template
// @access  Private (Admin only)
router.get('/import/template', auth, authorize('inventory_manager', 'super_admin'), (req, res) => {
  try {
    const template = csvImporter.getImportTemplate();
    res.json(template);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/products/import/sample
// @desc    Download sample CSV
// @access  Private (Admin only)
router.get('/import/sample', auth, authorize('inventory_manager', 'super_admin'), (req, res) => {
  try {
    const csvContent = csvImporter.generateSampleCSV();
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="products-sample.csv"');
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// @route   GET /api/products/import/sample-update
// @desc    Download sample CSV for updates only
// @access  Private (Admin only)
router.get('/import/sample-update', auth, authorize('inventory_manager', 'super_admin'), (req, res) => {
  try {
    const csvContent = csvImporter.generateSampleCSV(true);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="products-update-sample.csv"');
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/products/bulk-images
// @desc    Bulk upload images and assign to products via filename mapping
//          Storage waterfall: Supabase → Cloudinary → local disk
// @access  Private (inventory_manager, super_admin)
router.post('/bulk-images', auth, authorize('inventory_manager', 'super_admin'), uploadProductImagesBulk.array('images', MAX_BULK_IMAGE_FILES), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No image files provided' });
    }

    let mapping;
    try {
      mapping = JSON.parse(req.body.mapping || '{}');
    } catch {
      return res.status(400).json({ message: 'Invalid mapping JSON' });
    }

    const fileMappings = [];
    const productsUpdated = {};
    const errors = [];
    let uploaded = 0;
    let failed = 0;

    for (const file of req.files) {
      const originalName = file.originalname;
      const productIds = mapping[originalName];

      if (!productIds || productIds.length === 0) {
        failed++;
        errors.push({ file: originalName, error: 'No product mapping provided' });
        continue;
      }

      // Run waterfall: Supabase → Cloudinary → local
      let imageUrl;
      try {
        const result = await waterfallUpload(file.buffer, originalName, 'products');
        imageUrl = result.url;
      } catch (err) {
        failed++;
        errors.push({ file: originalName, error: `Storage failed: ${err.message}` });
        continue;
      }

      const assignedIds = [];

      for (const productId of productIds) {
        try {
          const product = await Product.findById(productId);
          if (!product) {
            throw new Error('Product not found');
          }

          product.images = sanitizeProductImages([
            ...(Array.isArray(product.images) ? product.images : []),
            imageUrl
          ]);
          await Product.update({ _id: product._id }, product);

          if (!productsUpdated[productId]) {
            productsUpdated[productId] = {
              name: product.name || productId,
              imagesAdded: 0,
              imageUrls: []
            };
          }
          productsUpdated[productId].imagesAdded++;
          productsUpdated[productId].imageUrls.push(imageUrl);
          assignedIds.push(productId);
        } catch (err) {
          errors.push({ file: originalName, productId, error: err.message });
        }
      }

      if (assignedIds.length > 0) {
        uploaded++;
        fileMappings.push({ filename: originalName, productIds: assignedIds, imageUrl });
      } else {
        failed++;
      }
    }

    res.json({
      success: true,
      uploaded,
      failed,
      fileMappings,
      productsUpdated: Object.entries(productsUpdated).map(([id, data]) => ({ id, ...data })),
      errors
    });
  } catch (error) {
    console.error('Bulk image upload error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
