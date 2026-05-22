const express = require('express');
const BlogPost = require('../models/BlogPost');
const BlogCategory = require('../models/BlogCategory');
const { auth, authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Configure multer for blog images - Updated for Multer 2.x
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/blog/');
  },
  filename: (req, file, cb) => {
    cb(null, `blog-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage,
  limits: { 
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880,
    files: 1 // Only one featured image per blog post
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

// @route   GET /api/blog/posts
// @desc    Get blog posts with pagination
// @access  Public
router.get('/posts', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      tag,
      search,
      status = 'published'
    } = req.query;

    const query = { status };

    if (category) {
      query.category = category;
    }

    if (tag) {
      query.tags = { $in: [tag] };
    }

    if (search) {
      query.$text = { $search: search };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const posts = await BlogPost.find(query)
      .populate('author', 'firstName lastName')
      .populate('category', 'name slug')
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await BlogPost.countDocuments(query);

    res.json({
      posts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalPosts: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/blog/posts/:slug
// @desc    Get single blog post by slug
// @access  Public
router.get('/posts/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ 
      slug: req.params.slug, 
      status: 'published' 
    })
      .populate('author', 'firstName lastName')
      .populate('category', 'name slug');

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Increment view count
    post.viewCount += 1;
    await post.save();

    res.json(post);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/blog/posts/related/:slug
// @desc    Get related blog posts
// @access  Public
router.get('/posts/related/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ 
      slug: req.params.slug, 
      status: 'published' 
    });

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Find related posts based on tags or category
    const relatedPosts = await BlogPost.find({
      _id: { $ne: post._id },
      status: 'published',
      $or: [
        { category: post.category },
        { tags: { $in: post.tags } }
      ]
    })
    .populate('author', 'firstName lastName')
    .populate('category', 'name slug')
    .sort({ publishedAt: -1 })
    .limit(4);

    res.json(relatedPosts);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/blog/posts
// @desc    Create blog post
// @access  Private (Content Manager only)
router.post('/posts', auth, authorize('content_manager', 'super_admin'), upload.single('featuredImage'), async (req, res) => {
  try {
    const {
      title,
      content,
      excerpt,
      category,
      tags,
      status = 'draft'
    } = req.body;

    const postData = {
      title,
      content,
      excerpt,
      author: req.user._id,
      category: category || null,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      status
    };

    if (req.file) {
      postData.featuredImage = `/uploads/blog/${req.file.filename}`;
    }

    if (status === 'published') {
      postData.publishedAt = new Date();
    }

    const post = new BlogPost(postData);
    await post.save();

    await post.populate('author', 'firstName lastName');
    await post.populate('category', 'name slug');

    res.status(201).json({
      message: 'Blog post created successfully',
      post
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/blog/posts/:id
// @desc    Update blog post
// @access  Private (Content Manager only)
router.put('/posts/:id', auth, authorize('content_manager', 'super_admin'), upload.single('featuredImage'), async (req, res) => {
  try {
    const {
      title,
      content,
      excerpt,
      category,
      tags,
      status
    } = req.body;

    const post = await BlogPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    post.title = title || post.title;
    post.content = content || post.content;
    post.excerpt = excerpt || post.excerpt;
    post.category = category !== undefined ? category : post.category;
    post.tags = tags ? tags.split(',').map(tag => tag.trim()) : post.tags;

    if (status && status !== post.status) {
      post.status = status;
      if (status === 'published' && !post.publishedAt) {
        post.publishedAt = new Date();
      }
    }

    if (req.file) {
      post.featuredImage = `/uploads/blog/${req.file.filename}`;
    }

    await post.save();

    await post.populate('author', 'firstName lastName');
    await post.populate('category', 'name slug');

    res.json({
      message: 'Blog post updated successfully',
      post
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/blog/posts/:id
// @desc    Delete blog post
// @access  Private (Content Manager only)
router.delete('/posts/:id', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    await BlogPost.findByIdAndDelete(req.params.id);

    res.json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Blog Categories Routes

// @route   GET /api/blog/categories
// @desc    Get blog categories
// @access  Public
router.get('/categories', async (req, res) => {
  try {
    const categories = await BlogCategory.find().sort({ name: 1 });

    // Add post count for each category
    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => {
        const postCount = await BlogPost.countDocuments({ 
          category: category._id, 
          status: 'published' 
        });
        return {
          ...category.toObject(),
          postCount
        };
      })
    );

    res.json(categoriesWithCount);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/blog/categories
// @desc    Create blog category
// @access  Private (Content Manager only)
router.post('/categories', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const category = new BlogCategory({
      name,
      description
    });

    await category.save();

    res.status(201).json({
      message: 'Blog category created successfully',
      category
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Category name already exists' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/blog/categories/:id
// @desc    Update blog category
// @access  Private (Content Manager only)
router.put('/categories/:id', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const { name, description } = req.body;

    const category = await BlogCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    category.name = name || category.name;
    category.description = description || category.description;

    await category.save();

    res.json({
      message: 'Blog category updated successfully',
      category
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/blog/categories/:id
// @desc    Delete blog category
// @access  Private (Content Manager only)
router.delete('/categories/:id', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const category = await BlogCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if category is used by any posts
    const postsCount = await BlogPost.countDocuments({ category: req.params.id });
    if (postsCount > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete category that is used by blog posts' 
      });
    }

    await BlogCategory.findByIdAndDelete(req.params.id);

    res.json({ message: 'Blog category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/blog/tags
// @desc    Get popular blog tags
// @access  Public
router.get('/tags', async (req, res) => {
  try {
    const tags = await BlogPost.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    res.json(tags.map(tag => ({
      name: tag._id,
      count: tag.count
    })));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/blog/featured
// @desc    Get featured/popular blog posts
// @access  Public
router.get('/featured', async (req, res) => {
  try {
    const featuredPosts = await BlogPost.find({ 
      status: 'published' 
    })
    .populate('author', 'firstName lastName')
    .populate('category', 'name slug')
    .sort({ viewCount: -1 })
    .limit(5);

    res.json(featuredPosts);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/blog/archive
// @desc    Get blog archive by month/year
// @access  Public
router.get('/archive', async (req, res) => {
  try {
    const archive = await BlogPost.aggregate([
      { $match: { status: 'published' } },
      {
        $group: {
          _id: {
            year: { $year: '$publishedAt' },
            month: { $month: '$publishedAt' }
          },
          count: { $sum: 1 },
          posts: {
            $push: {
              _id: '$_id',
              title: '$title',
              slug: '$slug',
              publishedAt: '$publishedAt'
            }
          }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } }
    ]);

    res.json(archive);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;