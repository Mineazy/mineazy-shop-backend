const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const ContactMessage = require('../models/ContactMessage');
const Transaction = require('../models/Transaction');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

const roundCurrency = (value) => Math.round((value || 0) * 100) / 100;

const getPercentageChange = (currentValue, previousValue) => {
  if (!previousValue) {
    return currentValue > 0 ? 100 : 0;
  }

  return roundCurrency(((currentValue - previousValue) / previousValue) * 100);
};

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard stats
// @access  Private (Admin only)
router.get('/dashboard', auth, authorize('order_manager', 'inventory_manager', 'super_admin'), async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = Math.max(parseInt(period, 10) || 30, 1);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const previousStartDate = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Get basic counts
    const [
      totalOrders,
      totalProducts,
      totalUsers,
      pendingOrders,
      lowStockProducts,
      totalRevenue,
      newMessages,
      currentPeriodOrders,
      previousPeriodOrders,
      currentPeriodRevenue,
      previousPeriodRevenue,
      currentPeriodUsers,
      previousPeriodUsers,
      recentOrders
    ] = await Promise.all([
      Order.countDocuments(),
      Product.countDocuments({ isActive: true }),
      User.countDocuments({ role: { $ne: 'super_admin' } }),
      Order.countDocuments({ status: 'pending' }),
      Product.countDocuments({ stockQuantity: { $lte: 5 }, isActive: true }),
      Transaction.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(result => result[0]?.total || 0),
      ContactMessage.countDocuments({ status: 'new' }),
      Order.countDocuments({ createdAt: { $gte: startDate } }),
      Order.countDocuments({
        createdAt: { $gte: previousStartDate, $lt: startDate }
      }),
      Transaction.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $match: {
            status: 'completed'
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(result => result[0]?.total || 0),
      Transaction.aggregate([
        {
          $match: {
            createdAt: { $gte: previousStartDate, $lt: startDate }
          }
        },
        {
          $match: {
            status: 'completed'
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(result => result[0]?.total || 0),
      User.countDocuments({
        role: { $ne: 'super_admin' },
        createdAt: { $gte: startDate }
      }),
      User.countDocuments({
        role: { $ne: 'super_admin' },
        createdAt: { $gte: previousStartDate, $lt: startDate }
      }),
      Order.find()
        .select('orderNumber customerInfo.email total status createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
    ]);

    const revenueTrend = getPercentageChange(currentPeriodRevenue, previousPeriodRevenue);
    const ordersTrend = getPercentageChange(currentPeriodOrders, previousPeriodOrders);
    const usersTrend = getPercentageChange(currentPeriodUsers, previousPeriodUsers);

    // Get order status breakdown
    const [
      ordersByStatus,
      revenueByDay,
      topProducts
    ] = await Promise.all([
      Order.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            paymentStatus: 'paid'
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            },
            revenue: { $sum: '$total' },
            orders: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Order.aggregate([
        {
          $match: {
            status: { $ne: 'cancelled' }
          }
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            name: { $first: '$items.name' },
            sku: { $first: '$items.sku' },
            unitsSold: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.total' }
          }
        },
        { $sort: { unitsSold: -1, revenue: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        {
          $addFields: {
            name: {
              $ifNull: ['$name', { $arrayElemAt: ['$product.name', 0] }]
            },
            sku: {
              $ifNull: ['$sku', { $arrayElemAt: ['$product.sku', 0] }]
            }
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            sku: 1,
            unitsSold: 1,
            revenue: 1
          }
        }
      ])
    ]);

    res.json({
      stats: {
        totalOrders,
        totalProducts,
        totalUsers,
        pendingOrders,
        recentOrdersCount: currentPeriodOrders,
        lowStockProducts,
        totalRevenue: roundCurrency(totalRevenue),
        currentPeriodRevenue: roundCurrency(currentPeriodRevenue),
        newMessages
      },
      trends: {
        revenue: revenueTrend,
        orders: ordersTrend,
        users: usersTrend
      },
      ordersByStatus,
      revenueByDay,
      topProducts: topProducts.map((product) => ({
        ...product,
        revenue: roundCurrency(product.revenue)
      })),
      recentOrders
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/admin/orders
// @desc    Get all orders for admin (ALL USERS)
// @access  Private (Admin only)
router.get('/orders', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      paymentStatus,
      startDate,
      endDate,
      search
    } = req.query;

    const query = {};

    // DO NOT filter by user - admins should see ALL orders
    // This was the bug that prevented super_admin from seeing all orders

    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (search) {
      query.$or = [
        { orderNumber: new RegExp(search, 'i') },
        { 'customerInfo.firstName': new RegExp(search, 'i') },
        { 'customerInfo.lastName': new RegExp(search, 'i') },
        { 'customerInfo.email': new RegExp(search, 'i') }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const orders = await Order.find(query)
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Order.countDocuments(query);

    res.json({
      orders,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalOrders: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/admin/orders/:id
// @desc    Get single order details (Admin)
// @access  Private (Admin only)
router.get('/orders/:id', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'firstName lastName email phone')
      .populate('items.product', 'name images sku');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/admin/orders/:id
// @desc    Update order (Admin)
// @access  Private (Admin only)
router.put('/orders/:id', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const { status, paymentStatus, trackingNumber, notes } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (status) order.status = status;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    if (trackingNumber) order.trackingNumber = trackingNumber;
    if (notes !== undefined) order.notes = notes;

    await order.save();

    // Send status update email if status changed
    if (status && status !== order.status) {
      try {
        const emailService = require('../utils/emailService');
        await emailService.sendOrderStatusUpdate(order, status);
      } catch (emailError) {
        console.error('Failed to send status update email:', emailError);
      }
    }

    res.json({
      message: 'Order updated successfully',
      order
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/admin/orders/:id
// @desc    Delete/Cancel order (Admin)
// @access  Private (Admin only)
router.delete('/orders/:id', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Only allow deletion of pending/cancelled orders
    if (!['pending', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ 
        message: 'Cannot delete orders that are processing, shipped, or delivered' 
      });
    }

    // Restore product stock if cancelling
    if (order.status !== 'cancelled') {
      for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (product) {
          product.stockQuantity += item.quantity;
          await product.save();
        }
      }
    }

    await Order.findByIdAndDelete(req.params.id);

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users (Admin)
// @access  Private (Super Admin only)
router.get('/users', auth, authorize('super_admin'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      search,
      isVerified,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    if (role && role !== 'all') {
      query.role = role;
    }

    if (isVerified !== undefined) {
      query.isVerified = isVerified === 'true';
    }

    if (search) {
      query.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { company: new RegExp(search, 'i') }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const users = await User.find(query)
      .select('-password')
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    const total = await User.countDocuments(query);

    res.json({
      users,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalUsers: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/admin/products
// @desc    Get all products (Admin)
// @access  Private (Inventory Manager/Super Admin)
router.get('/products', auth, authorize('inventory_manager', 'super_admin'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      inStock,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    if (category) query.category = category;
    if (inStock !== undefined) {
      query.inStock = inStock === 'true';
    }

    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { sku: new RegExp(search, 'i') },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const products = await Product.find(query)
      .populate('category', 'name slug')
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    const total = await Product.countDocuments(query);

    res.json({
      products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/admin/stats/revenue
// @desc    Get detailed revenue statistics
// @access  Private (Admin only)
router.get('/stats/revenue', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const revenueStats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          paymentStatus: 'paid'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          avgOrderValue: { $avg: '$total' }
        }
      }
    ]);

    res.json(revenueStats[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      avgOrderValue: 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
