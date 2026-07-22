const express = require('express');
const BlogPost = require('../models/BlogPost');
const BlogCategory = require('../models/BlogCategory');
const User = require('../models/User');
const MongoShim = require('../utils/mongoshim');
const { auth, authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const router = express.Router();

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
    files: 1
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

const listPosts = async (req, res) => {
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
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    await MongoShim.populate(posts, 'author', User, 'firstName lastName');
    await MongoShim.populate(posts, 'category', BlogCategory, 'name slug');

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
};

router.get('/', listPosts);
router.get('/posts', listPosts);

const getRelatedPosts = async (req, res) => {
  try {
    const post = await BlogPost.findOne({
      slug: req.params.slug,
      status: 'published'
    });

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const relatedPosts = await BlogPost.find({
      _id: { $ne: post._id },
      status: 'published',
      $or: [
        { category: post.category },
        { tags: { $in: post.tags } }
      ]
    })
    .sort({ publishedAt: -1 })
    .limit(4);

    await MongoShim.populate(relatedPosts, 'author', User, 'firstName lastName');
    await MongoShim.populate(relatedPosts, 'category', BlogCategory, 'name slug');

    res.json(relatedPosts);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

router.get('/related/:slug', getRelatedPosts);
router.get('/posts/related/:slug', getRelatedPosts);

const getSinglePost = async (req, res) => {
  try {
    const post = await BlogPost.findOne({
      slug: req.params.slug,
      status: 'published'
    });

    if (post) {
      await MongoShim.populate(post, 'author', User, 'firstName lastName');
      await MongoShim.populate(post, 'category', BlogCategory, 'name slug');
    }

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    post.viewCount += 1;
    await BlogPost.update({ _id: post._id }, post);

    res.json(post);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

router.get('/categories', async (req, res) => {
  try {
    const categories = await BlogCategory.find().sort({ name: 1 });

    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => {
        const postCount = await BlogPost.countDocuments({
          category: category._id,
          status: 'published'
        });
        return {
          ...category,
          postCount
        };
      })
    );

    res.json(categoriesWithCount);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

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

router.get('/featured', async (req, res) => {
  try {
    const featuredPosts = await BlogPost.find({
      status: 'published'
    })
    .sort({ viewCount: -1 })
    .limit(5);

    await MongoShim.populate(featuredPosts, 'author', User, 'firstName lastName');
    await MongoShim.populate(featuredPosts, 'category', BlogCategory, 'name slug');

    res.json(featuredPosts);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

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

router.get('/posts/:slug', getSinglePost);
router.get('/:slug', getSinglePost);

router.post('/', auth, authorize('content_manager', 'super_admin'), upload.single('featuredImage'), async (req, res) => {
  try {
    const {
      title,
      content,
      excerpt,
      category,
      tags,
      status = 'draft',
      metaTitle,
      metaDescription,
      metaKeywords
    } = req.body;

    const postData = {
      title,
      content,
      excerpt,
      author: req.user._id,
      category: category || null,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      status,
      metaTitle,
      metaDescription,
      metaKeywords
    };

    if (req.file) {
      postData.featuredImage = `/uploads/blog/${req.file.filename}`;
    }

    if (status === 'published') {
      postData.publishedAt = new Date();
    }

    const post = await BlogPost.insert(postData);

    await MongoShim.populate(post, 'author', User, 'firstName lastName');
    await MongoShim.populate(post, 'category', BlogCategory, 'name slug');

    res.status(201).json({
      message: 'Blog post created successfully',
      post
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', auth, authorize('content_manager', 'super_admin'), upload.single('featuredImage'), async (req, res) => {
  try {
    const {
      title,
      content,
      excerpt,
      category,
      tags,
      status,
      metaTitle,
      metaDescription,
      metaKeywords
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
    if (metaTitle !== undefined) post.metaTitle = metaTitle;
    if (metaDescription !== undefined) post.metaDescription = metaDescription;
    if (metaKeywords !== undefined) post.metaKeywords = metaKeywords;

    if (status && status !== post.status) {
      post.status = status;
      if (status === 'published' && !post.publishedAt) {
        post.publishedAt = new Date();
      }
    }

    if (req.file) {
      post.featuredImage = `/uploads/blog/${req.file.filename}`;
    }

    await BlogPost.update({ _id: post._id }, post);

    await MongoShim.populate(post, 'author', User, 'firstName lastName');
    await MongoShim.populate(post, 'category', BlogCategory, 'name slug');

    res.json({
      message: 'Blog post updated successfully',
      post
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
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

router.post('/categories', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const { name, description, metaTitle, metaDescription } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const category = await BlogCategory.insert({
      name,
      description,
      metaTitle,
      metaDescription
    });

    res.status(201).json({
      message: 'Blog category created successfully',
      category
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/categories/:id', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const { name, description, metaTitle, metaDescription } = req.body;

    const category = await BlogCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    category.name = name || category.name;
    category.description = description || category.description;
    if (metaTitle !== undefined) category.metaTitle = metaTitle;
    if (metaDescription !== undefined) category.metaDescription = metaDescription;

    await BlogCategory.update({ _id: category._id }, category);

    res.json({
      message: 'Blog category updated successfully',
      category
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/categories/:id', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const category = await BlogCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

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

module.exports = router;
