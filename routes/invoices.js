const express = require('express');
const Order = require('../models/Order');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Product = require('../models/Product');
const MongoShim = require('../utils/mongoshim');
const { auth, authorize } = require('../middleware/auth');
const pdfGenerator = require('../utils/pdfGenerator');
const emailService = require('../utils/emailService');

const router = express.Router();

const getCustomerOrderQuery = (user) => {
  const query = { user: user._id };
  const email = user.email?.trim().toLowerCase();

  if (user.isVerified && email) {
    return {
      $or: [
        query,
        {
          user: null,
          isGuest: true,
          'customerInfo.email': email
        }
      ]
    };
  }

  return query;
};

async function populateItemsProduct(docs) {
  const arr = Array.isArray(docs) ? docs : [docs];
  const ids = [];
  for (const d of arr) {
    for (const item of (d.items || [])) {
      if (item.product) {
        ids.push(typeof item.product === 'object' ? (item.product._id || item.product.toString()) : item.product.toString());
      }
    }
  }
  if (!ids.length) return;
  const uniqueIds = [...new Set(ids)];
  const products = await Product.find({ _id: { $in: uniqueIds } });
  const map = {};
  for (const p of products) map[p._id] = p;
  for (const d of arr) {
    for (const item of (d.items || [])) {
      const pid = typeof item.product === 'object' ? (item.product._id || item.product) : item.product;
      if (pid && map[pid]) item.product = map[pid];
    }
  }
}

// Helper function to handle PDF/HTML response
async function handleInvoiceResponse(res, order, format) {
  try {
    const result = await pdfGenerator.generateInvoice(order, {
      allowHtmlFallback: true
    });
    
    if (result && result.isHtml) {
      console.log('≡ƒôä Serving HTML invoice as fallback (PDF generation unavailable)');
      
      if (format === 'pdf') {
        const htmlWithPrint = result.html.replace('</body>',
          '<script>window.onload=function(){setTimeout(function(){window.print()},500)}</script></body>');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.orderNumber}.html"`);
        res.send(htmlWithPrint);
      } else {
        res.json({
          order,
          invoice: {
            number: order.orderNumber,
            date: order.createdAt,
            customer: order.customerInfo,
            items: order.items,
            subtotal: order.subtotal,
            tax: order.tax,
            total: order.total,
            html: result.html,
            isPdfAvailable: false,
            message: 'PDF generation unavailable, HTML invoice provided'
          }
        });
      }
    } else if (result && Buffer.isBuffer(result)) {
      console.log('≡ƒôä Serving PDF invoice');
      
      const isPDF = result.slice(0, 4).toString() === '%PDF';
      if (!isPDF) {
        console.error('ΓÜá∩╕Å Generated buffer is not a valid PDF');
        throw new Error('Invalid PDF generated');
      }
      
      if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.orderNumber}.pdf"`);
        res.setHeader('Content-Length', result.length);
        res.send(result);
      } else {
        res.json({
          order,
          invoice: {
            number: order.orderNumber,
            date: order.createdAt,
            customer: order.customerInfo,
            items: order.items,
            subtotal: order.subtotal,
            tax: order.tax,
            total: order.total,
            isPdfAvailable: true
          }
        });
      }
    } else {
      throw new Error('Invalid response from PDF generator');
    }
  } catch (error) {
    console.error('Γ¥î Invoice generation failed completely:', error);

    if (format === 'pdf') {
      try {
        const html = pdfGenerator.generateInvoiceHTML(order);
        const htmlWithPrint = html.replace('</body>',
          '<script>window.onload=function(){setTimeout(function(){window.print()},500)}</script></body>');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.orderNumber}.html"`);
        return res.send(htmlWithPrint);
      } catch (htmlError) {
        return res.status(503).json({
          message: 'Failed to generate invoice. Please try again shortly.',
          code: 'INVOICE_GENERATION_FAILED',
          error: error.message
        });
      }
    }

    return res.status(500).json({
      message: 'Invoice generation failed. Please try again later.',
      order,
      invoice: {
        number: order.orderNumber,
        date: order.createdAt,
        customer: order.customerInfo,
        items: order.items,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        isPdfAvailable: false,
        message: 'Invoice generation failed',
        error: error.message
      }
    });
  }
}

// @route   GET /api/invoices/:orderId
// @desc    Get invoice (PDF/HTML)
// @access  Private
router.get('/:orderId([0-9a-fA-F]{24})', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.query.token;
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    delete user.password;

    const order = await Order.findOne({
      $and: [
        { _id: req.params.orderId },
        getCustomerOrderQuery(user)
      ]
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    await populateItemsProduct(order);

    const format = req.query.format || 'json';
    await handleInvoiceResponse(res, order, format);
    
  } catch (error) {
    console.error('Invoice error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/invoices/guest/:orderNumber/:email
// @desc    Get guest invoice
// @access  Public
router.get('/guest/:orderNumber/:email', async (req, res) => {
  try {
    const { orderNumber, email } = req.params;
    const format = req.query.format || 'json';

    const order = await Order.findOne({
      orderNumber,
      'customerInfo.email': email,
      isGuest: true
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    await populateItemsProduct(order);

    await handleInvoiceResponse(res, order, format);
    
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/invoices/:orderId/send
// @desc    Send invoice via email
// @access  Private
router.post('/:orderId([0-9a-fA-F]{24})/send', auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      $and: [
        { _id: req.params.orderId },
        getCustomerOrderQuery(req.user)
      ]
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    await populateItemsProduct(order);

    const result = await pdfGenerator.generateInvoice(order, { allowHtmlFallback: false });

    if (!Buffer.isBuffer(result)) {
      throw new Error('Invoice PDF generation did not return a valid PDF buffer');
    }

    await emailService.sendInvoice(order, result);

    res.json({ message: 'Invoice sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/invoices/:orderId/download
// @desc    Download PDF invoice
// @access  Private
router.get('/:orderId([0-9a-fA-F]{24})/download', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.query.token;
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    delete user.password;

    const order = await Order.findOne({
      $and: [
        { _id: req.params.orderId },
        getCustomerOrderQuery(user)
      ]
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    await populateItemsProduct(order);

    await handleInvoiceResponse(res, order, 'pdf');
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/invoices
// @desc    Get user's invoices
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const query = getCustomerOrderQuery(req.user);
    if (status) {
      query.$and = [...(query.$and || []), { paymentStatus: status }];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const orders = await Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum);

    const total = await Order.countDocuments(query);

    const invoices = orders.map(order => ({
      id: order._id,
      invoiceNumber: order.orderNumber,
      date: order.createdAt,
      amount: order.total,
      subtotal: order.subtotal,
      tax: order.tax,
      status: order.paymentStatus,
      orderStatus: order.status,
      customer: {
        name: `${order.customerInfo.firstName} ${order.customerInfo.lastName}`,
        email: order.customerInfo.email
      }
    }));

    res.json({
      invoices,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalInvoices: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Admin routes for invoice management

// @route   GET /api/invoices/admin/all
// @desc    List all invoices (Admin)
// @access  Private (Admin only)
router.get('/admin/all', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status, startDate, endDate, search } = req.query;

    const query = {};
    if (status && status !== 'all') {
      query.paymentStatus = status;
    }
    
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

    const orders = await Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum);
    await MongoShim.populate(orders, 'user', User, 'firstName lastName email');

    const total = await Order.countDocuments(query);

    const invoices = orders.map(order => ({
      id: order._id,
      invoiceNumber: order.orderNumber,
      date: order.createdAt,
      amount: order.total,
      subtotal: order.subtotal,
      tax: order.tax,
      status: order.paymentStatus,
      orderStatus: order.status,
      paymentMethod: order.paymentMethod,
      customer: {
        name: `${order.customerInfo.firstName} ${order.customerInfo.lastName}`,
        email: order.customerInfo.email,
        phone: order.customerInfo.phone
      },
      user: order.user,
      isGuest: order.isGuest
    }));

    res.json({
      invoices,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalInvoices: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/invoices/admin/:orderId/send
// @desc    Send invoice to customer (Admin)
// @access  Private (Admin only)
router.post('/admin/:orderId/send', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    await populateItemsProduct(order);

    const result = await pdfGenerator.generateInvoice(order, { allowHtmlFallback: false });

    if (!Buffer.isBuffer(result)) {
      throw new Error('Invoice PDF generation did not return a valid PDF buffer');
    }

    await emailService.sendInvoice(order, result);

    res.json({ message: 'Invoice sent to customer successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/invoices/admin/:orderId/pdf
// @desc    Generate PDF invoice (Admin)
// @access  Private (Admin only)
router.get('/admin/:orderId/pdf', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    await populateItemsProduct(order);

    await handleInvoiceResponse(res, order, 'pdf');
    
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/invoices/admin/bulk-send
// @desc    Send multiple invoices (Admin)
// @access  Private (Admin only)
router.post('/admin/bulk-send', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: 'Order IDs array is required' });
    }

    const results = {
      sent: [],
      failed: []
    };

    for (const orderId of orderIds) {
      try {
        const order = await Order.findById(orderId);

        if (!order) {
          results.failed.push({ orderId, error: 'Order not found' });
          continue;
        }

        await populateItemsProduct(order);

        const result = await pdfGenerator.generateInvoice(order, { allowHtmlFallback: false });

        if (!Buffer.isBuffer(result)) {
          throw new Error('Invoice PDF generation did not return a valid PDF buffer');
        }

        await emailService.sendInvoice(order, result);
        
        results.sent.push({ orderId, orderNumber: order.orderNumber });
      } catch (error) {
        results.failed.push({ orderId, error: error.message });
      }
    }

    res.json({
      message: `Bulk send completed. ${results.sent.length} sent, ${results.failed.length} failed.`,
      results
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/invoices/stats/overview
// @desc    Get invoice statistics (Admin)
// @access  Private (Admin only)
router.get('/stats/overview', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const totalInvoices = await Order.countDocuments();
    const paidInvoices = await Order.countDocuments({ paymentStatus: 'paid' });
    const pendingInvoices = await Order.countDocuments({ paymentStatus: 'pending' });
    const overdueInvoices = await Order.countDocuments({ 
      paymentStatus: { $in: ['payment_on_delivery', 'payment_on_collection'] },
      createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });

    const totalRevenue = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    const pendingRevenue = await Order.aggregate([
      { $match: { paymentStatus: { $ne: 'paid' } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
    const paidOrders = await Order.find({
      createdAt: { $gte: sixMonthsAgo },
      paymentStatus: 'paid'
    });
    const monthMap = {};
    for (const o of paidOrders) {
      const d = new Date(o.createdAt);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const key = `${year}-${month}`;
      if (!monthMap[key]) {
        monthMap[key] = { _id: { year, month }, revenue: 0, count: 0 };
      }
      monthMap[key].revenue += (o.total || 0);
      monthMap[key].count += 1;
    }
    const monthlyRevenue = Object.values(monthMap).sort((a, b) => {
      if (a._id.year !== b._id.year) return a._id.year - b._id.year;
      return a._id.month - b._id.month;
    });

    res.json({
      totalInvoices,
      paidInvoices,
      pendingInvoices,
      overdueInvoices,
      totalRevenue: totalRevenue[0]?.total || 0,
      pendingRevenue: pendingRevenue[0]?.total || 0,
      monthlyRevenue,
      paymentRate: totalInvoices > 0 ? (paidInvoices / totalInvoices * 100).toFixed(2) : 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
