const express = require('express');
const Page = require('../models/Page');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/pages/:slug
// @desc    Get static page by slug
// @access  Public
router.get('/:slug', async (req, res) => {
  try {
    const page = await Page.findOne({ 
      slug: req.params.slug, 
      isPublished: true 
    }).populate('author', 'firstName lastName');

    if (!page) {
      return res.status(404).json({ message: 'Page not found' });
    }

    res.json(page);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/pages
// @desc    Create static page
// @access  Private (Content Manager only)
router.post('/', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const {
      title,
      content,
      metaTitle,
      metaDescription,
      isPublished = true
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const page = new Page({
      title,
      content,
      metaTitle,
      metaDescription,
      isPublished,
      author: req.user._id
    });

    await page.save();
    await page.populate('author', 'firstName lastName');

    res.status(201).json({
      message: 'Page created successfully',
      page
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/pages/:id
// @desc    Update static page
// @access  Private (Content Manager only)
router.put('/:id', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const {
      title,
      content,
      metaTitle,
      metaDescription,
      isPublished
    } = req.body;

    const page = await Page.findById(req.params.id);
    if (!page) {
      return res.status(404).json({ message: 'Page not found' });
    }

    page.title = title || page.title;
    page.content = content || page.content;
    page.metaTitle = metaTitle || page.metaTitle;
    page.metaDescription = metaDescription || page.metaDescription;
    page.isPublished = isPublished !== undefined ? isPublished : page.isPublished;

    await page.save();
    await page.populate('author', 'firstName lastName');

    res.json({
      message: 'Page updated successfully',
      page
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/pages/:id
// @desc    Delete static page
// @access  Private (Content Manager only)
router.delete('/:id', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const page = await Page.findById(req.params.id);
    if (!page) {
      return res.status(404).json({ message: 'Page not found' });
    }

    await Page.findByIdAndDelete(req.params.id);

    res.json({ message: 'Page deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;