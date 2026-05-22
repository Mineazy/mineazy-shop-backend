const express = require('express');
const Quote = require('../models/Quote');
const Product = require('../models/Product');
const { auth, optionalAuth, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/quotes
// @desc    Create quote request
// @access  Public (with optional auth)
router.post('/', optionalAuth, async (req, res) => {
  try {
    const {
      customerInfo,
      items,
      notes
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Quote items are required' });
    }

    let subtotal = 0;
    const processedItems = [];

    for (const item of items) {
      if (item.product) {
        // Standard product
        const product = await Product.findById(item.product);
        if (!product) {
          return res.status(404).json({ message: `Product not found: ${item.product}` });
        }

        const itemTotal = product.effectivePrice * item.quantity;
        subtotal += itemTotal;

        processedItems.push({
          product: item.product,
          quantity: item.quantity,
          unitPrice: product.effectivePrice,
          totalPrice: itemTotal
        });
      } else if (item.customItem) {
        // Custom item for quote
        const itemTotal = item.unitPrice * item.quantity;
        subtotal += itemTotal;

        processedItems.push({
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: itemTotal,
          customItem: {
            name: item.customItem.name,
            description: item.customItem.description
          }
        });
      }
    }

    const tax = subtotal * 0.155; // 15.5% VAT
    const total = subtotal + tax;

    const quoteData = {
      user: req.user ? req.user._id : null,
      customerInfo: req.user ? {
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        phone: req.user.phone,
        company: req.user.company
      } : customerInfo,
      items: processedItems,
      subtotal,
      tax,
      total,
      notes,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };

    const quote = new Quote(quoteData);
    await quote.save();

    await quote.populate('items.product', 'name sku price');

    res.status(201).json({
      message: 'Quote request created successfully',
      quote
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/quotes
// @desc    Get user's quotes
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const quotes = await Quote.find({ user: req.user._id })
      .populate('items.product', 'name sku price')
      .sort({ createdAt: -1 });

    res.json(quotes);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/quotes/:id
// @desc    Get single quote
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const quote = await Quote.findOne({
      _id: req.params.id,
      user: req.user._id
    }).populate('items.product', 'name sku price images');

    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    res.json(quote);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/quotes/:id/accept
// @desc    Accept quote (customer)
// @access  Private
router.put('/:id/accept', auth, async (req, res) => {
  try {
    const quote = await Quote.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    if (quote.status !== 'sent') {
      return res.status(400).json({ message: 'Quote cannot be accepted in current status' });
    }

    if (new Date() > quote.validUntil) {
      return res.status(400).json({ message: 'Quote has expired' });
    }

    quote.status = 'accepted';
    await quote.save();

    res.json({
      message: 'Quote accepted successfully',
      quote
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/quotes/:id/reject
// @desc    Reject quote (customer)
// @access  Private
router.put('/:id/reject', auth, async (req, res) => {
  try {
    const { reason } = req.body;

    const quote = await Quote.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    if (quote.status !== 'sent') {
      return res.status(400).json({ message: 'Quote cannot be rejected in current status' });
    }

    quote.status = 'rejected';
    if (reason) {
      quote.notes = (quote.notes || '') + `\n\nRejection reason: ${reason}`;
    }
    await quote.save();

    res.json({
      message: 'Quote rejected',
      quote
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Admin routes for quote management

// @route   GET /api/quotes/admin/all
// @desc    Get all quotes (Admin)
// @access  Private (Sales Rep/Admin only)
router.get('/admin/all', auth, authorize('sales_rep', 'super_admin'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      startDate,
      endDate
    } = req.query;

    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (search) {
      query.$or = [
        { quoteNumber: new RegExp(search, 'i') },
        { 'customerInfo.firstName': new RegExp(search, 'i') },
        { 'customerInfo.lastName': new RegExp(search, 'i') },
        { 'customerInfo.email': new RegExp(search, 'i') },
        { 'customerInfo.company': new RegExp(search, 'i') }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const quotes = await Quote.find(query)
      .populate('user', 'firstName lastName email')
      .populate('items.product', 'name sku')
      .populate('salesRep', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Quote.countDocuments(query);

    res.json({
      quotes,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalQuotes: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/quotes/:id/admin/update
// @desc    Update quote (Admin)
// @access  Private (Sales Rep/Admin only)
router.put('/:id/admin/update', auth, authorize('sales_rep', 'super_admin'), async (req, res) => {
  try {
    const { status, items, notes, salesRep, validUntil } = req.body;

    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    if (status) quote.status = status;
    if (items) {
      // Recalculate totals if items changed
      let subtotal = 0;
      for (const item of items) {
        subtotal += item.unitPrice * item.quantity;
      }
      quote.items = items;
      quote.subtotal = subtotal;
      quote.tax = subtotal * 0.155;
      quote.total = subtotal + quote.tax;
    }
    if (notes) quote.notes = notes;
    if (salesRep) quote.salesRep = salesRep;
    if (validUntil) quote.validUntil = validUntil;

    await quote.save();

    res.json({
      message: 'Quote updated successfully',
      quote
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/quotes/:id/send
// @desc    Send quote to customer (Admin)
// @access  Private (Sales Rep/Admin only)
router.post('/:id/send', auth, authorize('sales_rep', 'super_admin'), async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
      .populate('items.product', 'name sku price');

    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    if (quote.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft quotes can be sent' });
    }

    quote.status = 'sent';
    quote.salesRep = req.user._id;
    await quote.save();

    // Send quote email (placeholder - implement email service)
    // await emailService.sendQuote(quote);

    res.json({
      message: 'Quote sent to customer successfully',
      quote
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/quotes/:id
// @desc    Delete quote
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const quote = await Quote.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    if (quote.status === 'accepted') {
      return res.status(400).json({ message: 'Cannot delete accepted quote' });
    }

    await Quote.findByIdAndDelete(req.params.id);

    res.json({ message: 'Quote deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/quotes/stats/overview
// @desc    Get quote statistics (Admin)
// @access  Private (Sales Rep/Admin only)
router.get('/stats/overview', auth, authorize('sales_rep', 'super_admin'), async (req, res) => {
  try {
    const totalQuotes = await Quote.countDocuments();
    const draftQuotes = await Quote.countDocuments({ status: 'draft' });
    const sentQuotes = await Quote.countDocuments({ status: 'sent' });
    const acceptedQuotes = await Quote.countDocuments({ status: 'accepted' });
    const rejectedQuotes = await Quote.countDocuments({ status: 'rejected' });
    const expiredQuotes = await Quote.countDocuments({ 
      status: 'sent',
      validUntil: { $lt: new Date() }
    });

    // Calculate total quote value
    const totalValue = await Quote.aggregate([
      { $match: { status: { $in: ['sent', 'accepted'] } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    const acceptedValue = await Quote.aggregate([
      { $match: { status: 'accepted' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    // Recent quotes (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentQuotes = await Quote.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    res.json({
      totalQuotes,
      draftQuotes,
      sentQuotes,
      acceptedQuotes,
      rejectedQuotes,
      expiredQuotes,
      recentQuotes,
      totalValue: totalValue[0]?.total || 0,
      acceptedValue: acceptedValue[0]?.total || 0,
      conversionRate: sentQuotes > 0 ? (acceptedQuotes / sentQuotes * 100).toFixed(2) : 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
