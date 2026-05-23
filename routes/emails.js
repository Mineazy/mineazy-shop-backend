const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { auth, authorize } = require('../middleware/auth');
const emailService = require('../utils/emailService');
const MongoShim = require('../utils/mongoshim');

const router = express.Router();

router.post('/order-confirmation', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.items && order.items.length) {
      const productIds = [...new Set(order.items.map(item => item.product).filter(Boolean))];
      const products = await Product.find({ _id: { $in: productIds } });
      const productMap = {};
      products.forEach(p => { productMap[p._id] = p; });
      order.items.forEach(item => {
        if (item.product && productMap[item.product]) {
          item.product = productMap[item.product];
        }
      });
    }

    await emailService.sendOrderConfirmation(order);

    res.json({ message: 'Order confirmation email sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/invoice', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.items && order.items.length) {
      const productIds = [...new Set(order.items.map(item => item.product).filter(Boolean))];
      const products = await Product.find({ _id: { $in: productIds } });
      const productMap = {};
      products.forEach(p => { productMap[p._id] = p; });
      order.items.forEach(item => {
        if (item.product && productMap[item.product]) {
          item.product = productMap[item.product];
        }
      });
    }

    const pdfGenerator = require('../utils/pdfGenerator');
    const pdfBuffer = await pdfGenerator.generateInvoice(order, { allowHtmlFallback: false });
    if (!Buffer.isBuffer(pdfBuffer)) {
      throw new Error('Invoice PDF generation did not return a valid PDF buffer');
    }
    await emailService.sendInvoice(order, pdfBuffer);

    res.json({ message: 'Invoice email sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/order-status', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const { orderId, status, message } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const statusMessages = {
      processing: 'Your order is being processed',
      shipped: 'Your order has been shipped',
      delivered: 'Your order has been delivered',
      cancelled: 'Your order has been cancelled'
    };

    const emailSubject = `Order Update - ${order.orderNumber}`;
    const emailBody = `
      <h2>Order Status Update</h2>
      <p>Dear ${order.customerInfo.firstName},</p>
      <p>Your order <strong>${order.orderNumber}</strong> status has been updated to: <strong>${status.toUpperCase()}</strong></p>
      <p>${message || statusMessages[status] || 'Your order status has been updated.'}</p>
      ${order.trackingNumber ? `<p>Tracking Number: <strong>${order.trackingNumber}</strong></p>` : ''}
      <p>Thank you for your business!</p>
    `;

    await emailService.sendEmail(order.customerInfo.email, emailSubject, emailBody);

    res.json({ message: 'Order status email sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/custom', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const { to, subject, message, isHtml = false } = req.body;

    if (!to || !subject || !message) {
      return res.status(400).json({ message: 'To, subject, and message are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const recipients = Array.isArray(to) ? to : [to];
    
    for (const email of recipients) {
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: `Invalid email address: ${email}` });
      }
    }

    const emailBody = isHtml ? message : `<p>${message.replace(/\n/g, '<br>')}</p>`;

    for (const email of recipients) {
      await emailService.sendEmail(email, subject, emailBody);
    }

    res.json({ 
      message: `Custom email sent successfully to ${recipients.length} recipient(s)` 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/newsletter', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const { subject, content, userType = 'all' } = req.body;

    if (!subject || !content) {
      return res.status(400).json({ message: 'Subject and content are required' });
    }

    const User = require('../models/User');
    let query = { isVerified: true };
    
    if (userType === 'customers') {
      query.role = 'customer';
    } else if (userType === 'business') {
      query.role = 'business';
    }

    const users = await User.find(query);

    if (users.length === 0) {
      return res.status(404).json({ message: 'No users found for the specified criteria' });
    }

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      try {
        const personalizedContent = content
          .replace('{{firstName}}', user.firstName)
          .replace('{{lastName}}', user.lastName)
          .replace('{{fullName}}', `${user.firstName} ${user.lastName}`);

        await emailService.sendEmail(user.email, subject, personalizedContent);
        sent++;
      } catch (emailError) {
        console.error(`Failed to send newsletter to ${user.email}:`, emailError);
        failed++;
      }
    }

    res.json({ 
      message: `Newsletter sent. ${sent} successful, ${failed} failed.`,
      stats: { sent, failed, total: users.length }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/bulk-order-update', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const { orderIds, status, message } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: 'Order IDs array is required' });
    }

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
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

        const statusMessages = {
          processing: 'Your order is being processed',
          shipped: 'Your order has been shipped',
          delivered: 'Your order has been delivered',
          cancelled: 'Your order has been cancelled'
        };

        const emailSubject = `Order Update - ${order.orderNumber}`;
        const emailBody = `
          <h2>Order Status Update</h2>
          <p>Dear ${order.customerInfo.firstName},</p>
          <p>Your order <strong>${order.orderNumber}</strong> status has been updated to: <strong>${status.toUpperCase()}</strong></p>
          <p>${message || statusMessages[status] || 'Your order status has been updated.'}</p>
          ${order.trackingNumber ? `<p>Tracking Number: <strong>${order.trackingNumber}</strong></p>` : ''}
          <p>Thank you for your business!</p>
        `;

        await emailService.sendEmail(order.customerInfo.email, emailSubject, emailBody);
        results.sent.push({ orderId, orderNumber: order.orderNumber });
      } catch (error) {
        results.failed.push({ orderId, error: error.message });
      }
    }

    res.json({
      message: `Bulk email completed. ${results.sent.length} sent, ${results.failed.length} failed.`,
      results
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/test', auth, authorize('super_admin'), async (req, res) => {
  try {
    const { to } = req.body;
    const testEmail = to || req.user.email;

    const subject = 'Test Email - Mining Equipment System';
    const content = `
      <h2>Test Email</h2>
      <p>This is a test email from the Mining Equipment System.</p>
      <p>Sent at: ${new Date().toISOString()}</p>
      <p>System is working correctly!</p>
    `;

    await emailService.sendEmail(testEmail, subject, content);

    res.json({ message: `Test email sent successfully to ${testEmail}` });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/templates', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const templates = [
      {
        id: 'order-confirmation',
        name: 'Order Confirmation',
        description: 'Sent when a new order is placed',
        variables: ['customerName', 'orderNumber', 'orderTotal', 'orderItems']
      },
      {
        id: 'order-shipped',
        name: 'Order Shipped',
        description: 'Sent when an order is shipped',
        variables: ['customerName', 'orderNumber', 'trackingNumber']
      },
      {
        id: 'order-delivered',
        name: 'Order Delivered',
        description: 'Sent when an order is delivered',
        variables: ['customerName', 'orderNumber']
      },
      {
        id: 'password-reset',
        name: 'Password Reset',
        description: 'Sent when user requests password reset',
        variables: ['customerName', 'resetLink']
      },
      {
        id: 'welcome',
        name: 'Welcome Email',
        description: 'Sent to new users',
        variables: ['customerName', 'verificationLink']
      },
      {
        id: 'newsletter',
        name: 'Newsletter',
        description: 'Regular newsletter to subscribers',
        variables: ['firstName', 'lastName', 'fullName']
      }
    ];

    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/stats', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const stats = {
      totalSent: 1250,
      deliveryRate: 98.5,
      openRate: 45.2,
      clickRate: 12.8,
      bounceRate: 1.5,
      recentActivity: [
        { date: new Date(), type: 'order-confirmation', count: 15 },
        { date: new Date(), type: 'newsletter', count: 245 },
        { date: new Date(), type: 'password-reset', count: 8 }
      ]
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
