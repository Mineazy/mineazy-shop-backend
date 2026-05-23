const express = require('express');
const Page = require('../models/Page');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const MongoShim = require('../utils/mongoshim');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const pages = await Page.find({ isPublished: true }).sort({ createdAt: -1 });
    res.json(pages);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const page = await Page.findOne({ 
      slug: req.params.slug, 
      isPublished: true 
    });

    if (!page) {
      return res.status(404).json({ message: 'Page not found' });
    }

    await MongoShim.populate(page, 'author', User, 'firstName lastName');

    res.json(page);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

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

    const page = await Page.insert({
      title,
      content,
      metaTitle,
      metaDescription,
      isPublished,
      author: req.user._id
    });

    await MongoShim.populate(page, 'author', User, 'firstName lastName');

    res.status(201).json({
      message: 'Page created successfully',
      page
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

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

    await Page.update({ _id: page._id }, page);
    await MongoShim.populate(page, 'author', User, 'firstName lastName');

    res.json({
      message: 'Page updated successfully',
      page
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

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
