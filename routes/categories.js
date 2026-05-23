const express = require('express');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { auth, authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const { body, validationResult } = require('express-validator');
const MongoShim = require('../utils/mongoshim');

const router = express.Router();

// Configure multer for category images - Updated for Multer 2.x
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/categories/');
  },
  filename: (req, file, cb) => {
    cb(null, `category-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage,
  limits: { 
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880,
    files: 1 // Only one file per upload for categories
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Validation middleware
const categoryValidation = [
  body('name').notEmpty().trim().withMessage('Category name is required'),
  body('description').optional().trim(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

// @route   GET /api/categories
// @desc    Get all categories
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { includeProducts = false, activeOnly = true } = req.query;

    let query = {};
    if (activeOnly === 'true') {
      query.isActive = true;
    }

    const categories = await Category.find(query).sort({ sortOrder: 1, name: 1 });

    if (includeProducts === 'true') {
      for (const category of categories) {
        const products = await Product.find({ category: category._id, isActive: true });
        category.products = products;
      }
    }

    // Build category tree (nested categories)
    const categoryTree = buildCategoryTree(categories);

    res.json({
      categories: categoryTree,
      total: categories.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/categories/:id
// @desc    Get single category
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (category) {
      await MongoShim.populate(category, 'parent', Category, 'name slug');
    }

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Get products in this category
    const products = await Product.find({ 
      category: category._id, 
      isActive: true 
    }).limit(12);

    // Get subcategories
    const subcategories = await Category.find({ 
      parent: category._id, 
      isActive: true 
    });

    res.json({
      category,
      products,
      subcategories,
      productCount: await Product.countDocuments({ category: category._id, isActive: true })
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/categories/slug/:slug
// @desc    Get category by slug
// @access  Public
router.get('/slug/:slug', async (req, res) => {
  try {
    const category = await Category.findOne({ 
      slug: req.params.slug, 
      isActive: true 
    });
    if (category) {
      await MongoShim.populate(category, 'parent', Category, 'name slug');
    }

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Get products in this category with pagination
    const { page = 1, limit = 12, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const products = await Product.find({ 
      category: category._id, 
      isActive: true 
    })
    .sort(sort)
    .skip(skip)
    .limit(limitNum);
    await MongoShim.populate(products, 'category', Category, 'name slug');

    const totalProducts = await Product.countDocuments({ 
      category: category._id, 
      isActive: true 
    });

    // Get subcategories
    const subcategories = await Category.find({ 
      parent: category._id, 
      isActive: true 
    });

    res.json({
      category,
      products,
      subcategories,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalProducts / limitNum),
        totalProducts
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/categories
// @desc    Create category
// @access  Private (Admin only)
router.post('/', auth, authorize('inventory_manager', 'super_admin'), upload.single('image'), categoryValidation, async (req, res) => {
  try {
    const { name, description, parent, sortOrder = 0 } = req.body;

    // Check if parent category exists
    if (parent) {
      const parentCategory = await Category.findById(parent);
      if (!parentCategory) {
        return res.status(400).json({ message: 'Parent category not found' });
      }
    }

    const categoryData = {
      name,
      description,
      parent: parent || null,
      sortOrder: parseInt(sortOrder)
    };

    if (req.file) {
      categoryData.image = `/uploads/categories/${req.file.filename}`;
    }

    const category = await Category.insert(categoryData);

    await MongoShim.populate(category, 'parent', Category, 'name slug');

    res.status(201).json({
      message: 'Category created successfully',
      category
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/categories/:id
// @desc    Update category
// @access  Private (Admin only)
router.put('/:id', auth, authorize('inventory_manager', 'super_admin'), upload.single('image'), async (req, res) => {
  try {
    const { name, description, parent, sortOrder, isActive } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if parent category exists and is not the same as current category
    if (parent && parent !== category._id.toString()) {
      const parentCategory = await Category.findById(parent);
      if (!parentCategory) {
        return res.status(400).json({ message: 'Parent category not found' });
      }
      
      // Prevent circular reference
      if (parent === req.params.id) {
        return res.status(400).json({ message: 'Category cannot be its own parent' });
      }
    }

    // Update fields
    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    if (parent !== undefined) category.parent = parent || null;
    if (sortOrder !== undefined) category.sortOrder = parseInt(sortOrder);
    if (isActive !== undefined) category.isActive = isActive;

    if (req.file) {
      category.image = `/uploads/categories/${req.file.filename}`;
    }

    await Category.update({ _id: category._id }, category);
    await MongoShim.populate(category, 'parent', Category, 'name slug');

    res.json({
      message: 'Category updated successfully',
      category
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/categories/:id
// @desc    Delete category
// @access  Private (Admin only)
router.delete('/:id', auth, authorize('inventory_manager', 'super_admin'), async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if category has products
    const productCount = await Product.countDocuments({ category: req.params.id });
    if (productCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category with ${productCount} products. Move or delete products first.` 
      });
    }

    // Check if category has subcategories
    const subcategoryCount = await Category.countDocuments({ parent: req.params.id });
    if (subcategoryCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category with ${subcategoryCount} subcategories. Move or delete subcategories first.` 
      });
    }

    await Category.findByIdAndDelete(req.params.id);

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/categories/tree
// @desc    Get category tree structure
// @access  Public
router.get('/tree', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 });

    const categoryTree = buildCategoryTree(categories);

    res.json(categoryTree);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Helper function to build category tree
function buildCategoryTree(categories) {
  const categoryMap = {};
  const tree = [];

  // Create a map of categories
  categories.forEach(category => {
    categoryMap[category._id] = {
      ...category,
      children: []
    };
  });

  // Build the tree structure
  categories.forEach(category => {
    if (category.parent) {
      if (categoryMap[category.parent]) {
        categoryMap[category.parent].children.push(categoryMap[category._id]);
      }
    } else {
      tree.push(categoryMap[category._id]);
    }
  });

  return tree;
}

module.exports = router;
