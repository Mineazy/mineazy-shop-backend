const express = require('express');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const MongoShim = require('../utils/mongoshim');
const PaynowClient = require('../utils/paynow');
const { optionalAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const { sendOrderConfirmationWithInvoice } = require('../utils/orderEmailService');

const router = express.Router();

const paynow = new PaynowClient(
  process.env.PAYNOW_INTEGRATION_ID,
  process.env.PAYNOW_INTEGRATION_KEY,
  process.env.PAYNOW_RETURN_URL,
  process.env.PAYNOW_RESULT_URL
);

// @route   GET /api/payments/methods
// @desc    Get available payment methods
// @access  Public
router.get('/methods', (req, res) => {
  const methods = [
    {
      id: 'paynow',
      name: 'Paynow',
      description: 'Pay online with Paynow (Cards, Mobile Money)',
      enabled: true
    },
    {
      id: 'cash_on_delivery',
      name: 'Cash on Delivery',
      description: 'Pay when your order is delivered',
      enabled: true
    },
    {
      id: 'collection',
      name: 'Pay on Collection',
      description: 'Pay when you collect your items',
      enabled: true
    }
  ];

  res.json(methods);
});

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

// @route   POST /api/payments/paynow/initiate
// @desc    Initiate Paynow payment
// @access  Public
router.post('/paynow/initiate', async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: 'Order ID is required' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Order already paid' });
    }

    console.log('≡ƒÆ│ Initiating Paynow payment for order:', order.orderNumber);

    if (!process.env.PAYNOW_INTEGRATION_ID || !process.env.PAYNOW_INTEGRATION_KEY) {
      console.error('Γ¥î Paynow credentials not configured!');
      return res.status(500).json({
        message: 'Payment gateway not configured',
        error: 'Missing Paynow credentials'
      });
    }

    const baseReturnUrl = process.env.PAYNOW_RETURN_URL || 
                         `${process.env.FRONTEND_URL}/payment-processing`;
    
    const returnUrlWithParams = `${baseReturnUrl}?orderId=${order._id}&orderNumber=${order.orderNumber}&email=${encodeURIComponent(order.customerInfo.email)}&isGuest=${order.isGuest}`;
    
    console.log('≡ƒöù Return URL with params:', returnUrlWithParams);

    const PaynowClient = require('../utils/paynow');
    const customPaynow = new PaynowClient(
      process.env.PAYNOW_INTEGRATION_ID,
      process.env.PAYNOW_INTEGRATION_KEY,
      returnUrlWithParams,
      process.env.PAYNOW_RESULT_URL
    );

    const paynowAuthEmail = process.env.PAYNOW_AUTH_EMAIL || order.customerInfo.email;

    const paynowResult = await customPaynow.initiateTransaction(
      order.orderNumber,
      order.total,
      order.customerInfo.email,
      order.customerInfo.phone,
      `Payment for order ${order.orderNumber}`,
      paynowAuthEmail
    );

    if (!paynowResult.success) {
      console.error('Γ¥î Paynow initiation failed:', paynowResult.error);
      return res.status(400).json({
        message: 'Failed to initiate payment',
        error: paynowResult.error,
        details: paynowResult.details || {}
      });
    }

    const transaction = await Transaction.insert({
      order: order._id,
      transactionId: uuidv4(),
      paymentMethod: 'paynow',
      amount: order.total,
      status: 'pending',
      paynowData: {
        pollUrl: paynowResult.pollUrl,
        reference: paynowResult.reference,
        status: 'awaiting_payment'
      }
    });

    order.paynowReference = paynowResult.reference;
    order.paymentStatus = 'awaiting_payment';
    await Order.update({ _id: order._id }, order);

    console.log('Γ£à Paynow payment initiated successfully');
    console.log('≡ƒôª Order details for guest:', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      isGuest: order.isGuest,
      email: order.customerInfo.email
    });

    res.json({
      success: true,
      redirectUrl: paynowResult.browserUrl,
      pollUrl: paynowResult.pollUrl,
      reference: paynowResult.reference,
      orderId: order._id,
      orderNumber: order.orderNumber,
      isGuest: order.isGuest,
      email: order.customerInfo.email
    });

  } catch (error) {
    console.error('Γ¥î Paynow initiation error:', error);
    res.status(500).json({ 
      message: 'Server error during payment initiation', 
      error: error.message
    });
  }
});

// @route   POST /api/payments/paynow/callback
// @desc    Handle Paynow webhook/callback
// @access  Public
router.post('/paynow/callback', async (req, res) => {
  try {
    console.log('≡ƒôÑ Paynow callback received:', req.body);

    const { reference, paynowreference, amount, status, hash } = req.body;

    if (!reference || !hash) {
      console.error('Γ¥î Missing required fields in callback');
      return res.status(400).json({ message: 'Invalid callback data' });
    }

    const callbackData = { ...req.body };
    delete callbackData.hash;
    
    const isValidHash = paynow.verifyHash(callbackData, hash);
    
    if (!isValidHash) {
      console.error('Γ¥î Invalid hash in Paynow callback');
      return res.status(400).json({ message: 'Invalid hash' });
    }

    const order = await Order.findOne({ orderNumber: reference });
    if (!order) {
      console.error('Γ¥î Order not found for reference:', reference);
      return res.status(404).json({ message: 'Order not found' });
    }

    console.log(`≡ƒôè Updating order ${order.orderNumber} - Status: ${status}`);

    const statusLower = status.toLowerCase();
    
    if (statusLower === 'paid') {
      order.paymentStatus = 'paid';
      order.status = 'processing';
      console.log('Γ£à Payment successful for order:', order.orderNumber);
    } else if (statusLower === 'cancelled' || statusLower === 'failed') {
      order.paymentStatus = 'failed';
      console.log('Γ¥î Payment failed for order:', order.orderNumber);
    } else if (statusLower === 'awaiting delivery') {
      order.paymentStatus = 'paid';
      order.status = 'processing';
    }

    await Order.update({ _id: order._id }, order);

    const transaction = await Transaction.findOne({ order: order._id });
    if (transaction) {
      transaction.status = statusLower === 'paid' ? 'completed' : 'failed';
      transaction.paynowData = {
        ...transaction.paynowData,
        status: status,
        paynowReference: paynowreference,
        amount: amount
      };
      await Transaction.update({ _id: transaction._id }, transaction);
    }

    if (statusLower === 'paid') {
      try {
        await sendOrderConfirmationWithInvoice(order);
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
      }
    }

    res.json({ message: 'Callback processed successfully' });

  } catch (error) {
    console.error('Γ¥î Callback processing error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/payments/cash-on-delivery
// @desc    Process COD order
// @access  Public
router.post('/cash-on-delivery', async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    order.paymentMethod = 'cash_on_delivery';
    order.paymentStatus = 'payment_on_delivery';
    order.status = 'processing';
    
    await Order.update({ _id: order._id }, order);

    const transaction = await Transaction.insert({
      order: order._id,
      transactionId: uuidv4(),
      paymentMethod: 'cash_on_delivery',
      amount: order.total,
      status: 'pending'
    });

    res.json({
      message: 'Cash on delivery order processed',
      order
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/payments/paynow/order-by-reference
// @desc    Find order by Paynow reference (for payment processing page)
// @access  Public
router.get('/paynow/order-by-reference', async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({ message: 'Paynow reference required' });
    }

    console.log('≡ƒöì Searching for order with Paynow reference:', reference);

    const order = await Order.findOne({ 
      paynowReference: reference 
    });

    if (!order) {
      console.log('Γ¥î No order found with reference:', reference);
      return res.status(404).json({ message: 'Order not found' });
    }

    await populateItemsProduct(order);

    console.log('Γ£à Found order:', order.orderNumber);

    res.json({
      success: true,
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: order.total,
        customerInfo: order.customerInfo,
        items: order.items
      }
    });

  } catch (error) {
    console.error('Γ¥î Error finding order by reference:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

// @route   GET /api/payments/paynow/order-status
// @desc    Check order status by order ID (for guest users after payment)
// @access  Public
router.get('/paynow/order-status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ message: 'Email is required for security verification' });
    }

    console.log('≡ƒöì Checking order status for guest:', { orderId, email });

    const order = await Order.findOne({
      _id: orderId,
      'customerInfo.email': email
    });

    if (!order) {
      console.log('Γ¥î Order not found or email mismatch');
      return res.status(404).json({ message: 'Order not found' });
    }

    await populateItemsProduct(order);

    console.log('Γ£à Order found:', {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus
    });

    res.json({
      success: true,
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: order.total,
        customerInfo: order.customerInfo,
        items: order.items,
        createdAt: order.createdAt
      }
    });

  } catch (error) {
    console.error('Γ¥î Error checking order status:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

// @route   GET /api/payments/guest-invoice/:orderNumber
// @desc    Get guest invoice by order number and email
// @access  Public (with email verification)
router.get('/guest-invoice/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { email, format = 'pdf' } = req.query;

    if (!email) {
      return res.status(400).json({ message: 'Email is required for security verification' });
    }

    console.log('≡ƒôä Guest invoice request:', { orderNumber, email, format });

    const order = await Order.findOne({
      orderNumber,
      'customerInfo.email': email,
      isGuest: true
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found or email mismatch' });
    }

    await populateItemsProduct(order);

    const pdfGenerator = require('../utils/pdfGenerator');
    
    if (format === 'pdf') {
      const result = await pdfGenerator.generateInvoice(order, { allowHtmlFallback: false });
      
      if (result && Buffer.isBuffer(result)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.orderNumber}.pdf"`);
        res.send(result);
      } else {
        throw new Error('Invalid invoice generation result');
      }
    } else {
      res.json({
        order: {
          orderNumber: order.orderNumber,
          total: order.total,
          subtotal: order.subtotal,
          tax: order.tax,
          status: order.status,
          paymentStatus: order.paymentStatus,
          items: order.items,
          customerInfo: order.customerInfo,
          createdAt: order.createdAt
        }
      });
    }

  } catch (error) {
    console.error('Γ¥î Guest invoice error:', error);
    res.status(500).json({ 
      message: 'Failed to generate invoice', 
      error: error.message 
    });
  }
});

// @route   POST /api/payments/collection
// @desc    Process collection order
// @access  Public
router.post('/collection', async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    order.paymentMethod = 'collection';
    order.paymentStatus = 'payment_on_collection';
    order.status = 'processing';
    
    await Order.update({ _id: order._id }, order);

    const transaction = await Transaction.insert({
      order: order._id,
      transactionId: uuidv4(),
      paymentMethod: 'collection',
      amount: order.total,
      status: 'pending'
    });

    res.json({
      message: 'Collection order processed',
      order
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
