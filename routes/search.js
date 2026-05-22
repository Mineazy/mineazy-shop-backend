const express = require('express');
const Product = require('../models/Product');

const router = express.Router();

// @route   GET /api/search/suggestions
// @desc    Get search suggestions/autocomplete
// @access  Public
router.get('/suggestions', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    // Search in product names and tags
    const products = await Product.find({
      $and: [
        { isActive: true },
        {
          $or: [
            { name: new RegExp(q, 'i') },
            { tags: { $in: [new RegExp(q, 'i')] } },
            { 'specifications.brand': new RegExp(q, 'i') }
          ]
        }
      ]
    })
    .select('name tags')
    .limit(10);

    const suggestions = [];
    const uniqueSuggestions = new Set();

    // Add product names
    products.forEach(product => {
      if (!uniqueSuggestions.has(product.name.toLowerCase())) {
        suggestions.push({
          type: 'product',
          text: product.name,
          id: product._id
        });
        uniqueSuggestions.add(product.name.toLowerCase());
      }
    });

    // Add matching tags
    products.forEach(product => {
      product.tags.forEach(tag => {
        if (tag.toLowerCase().includes(q.toLowerCase()) && 
            !uniqueSuggestions.has(tag.toLowerCase())) {
          suggestions.push({
            type: 'tag',
            text: tag
          });
          uniqueSuggestions.add(tag.toLowerCase());
        }
      });
    });

    res.json({
      suggestions: suggestions.slice(0, 8)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;