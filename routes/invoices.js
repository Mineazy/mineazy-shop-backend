const express = require('express');
const Order = require('../models/Order');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
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

// Helper function to handle PDF/HTML response
async function handleInvoiceResponse(res, order, format) {
  try {
    const result = await pdfGenerator.generateInvoice(order, {
      allowHtmlFallback: format !== 'pdf'
    });
    
    // Check if we got HTML fallback or actual PDF
    if (result && result.isHtml) {
      // We got HTML fallback - IMPORTANT: Change file extension to .html
      console.log('≡ƒôä Serving HTML invoice as fallback (PDF generation failed)');
      
      if (format === 'pdf') {
        return res.status(503).json({
          message: 'Invoice PDF is temporarily unavailable. Please try again shortly.',
          code: 'PDF_UNAVAILABLE'
        });
      } else {
        // Return JSON with HTML content
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
      // We got actual PDF buffer - verify it's valid
      console.log('≡ƒôä Serving PDF invoice');
      
      // Check if buffer starts with %PDF (PDF magic number)
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
      // Something went wrong
      throw new Error('Invalid response from PDF generator');
    }
  } catch (error) {
    console.error('Γ¥î Invoice generation failed completely:', error);

    if (format === 'pdf') {
      return res.status(503).json({
        message: 'Failed to generate invoice PDF. Please try again shortly.',
        code: 'PDF_GENERATION_FAILED',
        error: error.message
      });
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
        error: error.message
      }
    });
    
    // Last resort: return basic HTML invoice that can be printed
    if (format !== 'pdf') {
      // Generate a printable HTML invoice with .html extension
      const simpleHtml = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8">
          
          <title>Invoice ${order.orderNumber}</title>
          <style>
            @page { size: A4; margin: 20mm; }
            body { 
              font-family: 'Segoe UI', Arial, sans-serif; 
              margin: 0;
              padding: 20px;
              color: #333;
            }
            .invoice-container {
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              background: linear-gradient(135deg, #28378a 0%, #1e2870 100%);
              color: white;
              padding: 30px;
              border-radius: 10px 10px 0 0;
              margin-bottom: 0;
            }
            .company-name {
              font-size: 32px;
              font-weight: bold;
              color: #f6f451;
              margin-bottom: 10px;
            }
            .invoice-title {
              font-size: 24px;
              margin: 20px 0;
            }
            .content {
              border: 2px solid #28378a;
              border-top: none;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 20px 0; 
            }
            th, td { 
              padding: 12px; 
              text-align: left; 
            }
            th { 
              background-color: #f8f9fa;
              border-bottom: 2px solid #28378a;
              color: #28378a;
              font-weight: 600;
            }
            td { 
              border-bottom: 1px solid #dee2e6; 
            }
            .total-row {
              font-weight: bold;
              font-size: 1.2em;
              background-color: #f8f9fa;
            }
            .total-row td {
              padding: 15px 12px;
              border-bottom: none;
              color: #28378a;
            }
            .info-section {
              display: flex;
              justify-content: space-between;
              margin: 20px 0;
            }
            .info-box {
              flex: 1;
              padding: 15px;
              background-color: #f8f9fa;
              border-left: 4px solid #f6f451;
              margin-right: 20px;
            }
            .info-box:last-child {
              margin-right: 0;
            }
            .info-label {
              font-weight: 600;
              color: #666;
              margin-bottom: 5px;
            }
            .print-notice {
              background-color: #fff3cd;
              border: 1px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 5px;
              text-align: center;
            }
            @media print {
              .print-notice { display: none !important; }
              body { margin: 0; }
              .header { 
                background: #28378a !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
            .btn-print {
              background: #28378a;
              color: white;
              padding: 10px 20px;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 16px;
              margin: 10px;
            }
            .btn-print:hover {
              background: #1e2870;
            }
          </style>
        </head>
        <body>
          <div class="invoice-container">
            <div class="print-notice">
              <strong>ΓÜá∩╕Å HTML Invoice</strong><br>
              This is a printable HTML invoice. Click the button below to print or save as PDF using your browser's print function.
              <br>
              <button class="btn-print" onclick="window.print()">≡ƒû¿∩╕Å Print Invoice</button>
            </div>
            
            <div class="header">
              <div class="company-name">MINEAZY</div>
              <div>Mining Equipment & Solutions</div>
              <div style="margin-top: 10px; font-size: 14px;">
                15 Plumtree Road, Belmont, Bulawayo, Zimbabwe<br>
                ≡ƒô₧ +263-712-290-046 | Γ£ë∩╕Å info@mineazy.co.zw
              </div>
            </div>
            
            <div class="content">
              <h1 class="invoice-title">Invoice #${order.orderNumber}</h1>
              
              <div class="info-section">
                <div class="info-box">
                  <div class="info-label">BILL TO</div>
                  <strong>${order.customerInfo.firstName} ${order.customerInfo.lastName}</strong><br>
                  ${order.customerInfo.email}<br>
                  ${order.customerInfo.phone}<br>
                  ${order.customerInfo.address.street}<br>
                  ${order.customerInfo.address.city}, ${order.customerInfo.address.country}
                </div>
                <div class="info-box">
                  <div class="info-label">INVOICE DETAILS</div>
                  <strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}<br>
                  <strong>Order #:</strong> ${order.orderNumber}<br>
                  <strong>Payment:</strong> ${order.paymentMethod.replace(/_/g, ' ')}<br>
                  <strong>Status:</strong> ${order.paymentStatus.replace(/_/g, ' ')}
                </div>
              </div>
              
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style="text-align: center;">Quantity</th>
                    <th style="text-align: right;">Unit Price</th>
                    <th style="text-align: right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.items.map(item => `
                    <tr>
                      <td>
                        <strong>${item.name}</strong><br>
                        <small style="color: #666;">SKU: ${item.sku}</small>
                      </td>
                      <td style="text-align: center;">${item.quantity}</td>
                      <td style="text-align: right;">${item.price.toFixed(2)}</td>
                      <td style="text-align: right;">${item.total.toFixed(2)}</td>
                    </tr>
                  `).join('')}
                  <tr>
                    <td colspan="3" style="text-align: right; padding-top: 20px;"><strong>Subtotal:</strong></td>
                    <td style="text-align: right; padding-top: 20px;">${order.subtotal.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td colspan="3" style="text-align: right;"><strong>Tax (VAT 15.5%):</strong></td>
                    <td style="text-align: right;">${order.tax.toFixed(2)}</td>
                  </tr>
                  <tr class="total-row">
                    <td colspan="3" style="text-align: right;"><strong>TOTAL AMOUNT:</strong></td>
                    <td style="text-align: right; font-size: 1.3em;">${order.total.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
              
              <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #dee2e6; text-align: center; color: #666;">
                <strong>Thank you for your business!</strong><br>
                For questions about this invoice, please contact accounts@mineazy.co.zw
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
      
      // IMPORTANT: Set as HTML file, not PDF
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.orderNumber}.html"`);
      res.send(simpleHtml);
    } else {
      res.status(500).json({ 
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
          error: 'PDF generation service temporarily unavailable'
        }
      });
    }
  }
}

// @route   GET /api/invoices/:orderId
// @desc    Get invoice (PDF/HTML)
// @access  Private
router.get('/:orderId([0-9a-fA-F]{24})', async (req, res) => {
  try {
    // Get token from either header or query parameter
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.query.token;
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const order = await Order.findOne({
      $and: [
        { _id: req.params.orderId },
        getCustomerOrderQuery(user)
      ]
    }).populate('items.product', 'name');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

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
    }).populate('items.product', 'name');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

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
    }).populate('items.product', 'name');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

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
    // Get token from either header or query parameter
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.query.token;
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const order = await Order.findOne({
      $and: [
        { _id: req.params.orderId },
        getCustomerOrderQuery(user)
      ]
    }).populate('items.product', 'name');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Force PDF format for download
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

    const orders = await Order.find(query)
      .select('orderNumber total subtotal tax createdAt paymentStatus status customerInfo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

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

    const orders = await Order.find(query)
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

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
    const order = await Order.findById(req.params.orderId)
      .populate('items.product', 'name');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

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
    const order = await Order.findById(req.params.orderId)
      .populate('items.product', 'name');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

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
        const order = await Order.findById(orderId)
          .populate('items.product', 'name');

        if (!order) {
          results.failed.push({ orderId, error: 'Order not found' });
          continue;
        }

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
      createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // 7 days old
    });

    // Revenue calculations
    const totalRevenue = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    const pendingRevenue = await Order.aggregate([
      { $match: { paymentStatus: { $ne: 'paid' } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    // Monthly revenue trend (last 6 months)
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
    const monthlyRevenue = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo },
          paymentStatus: 'paid'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          revenue: { $sum: '$total' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

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
