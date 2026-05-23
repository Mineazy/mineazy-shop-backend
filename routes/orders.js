const express = require('express');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const MongoShim = require('../utils/mongoshim');
const { auth, optionalAuth, authorize } = require('../middleware/auth');
const { orderValidation } = require('../middleware/validation');
const { sendOrderConfirmationWithInvoice } = require('../utils/orderEmailService');

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

router.post('/', optionalAuth, orderValidation.create, async (req, res) => {
  try {
    const {
      customerInfo,
      paymentMethod,
      notes,
      sessionId
    } = req.body;

    let cart;
    if (req.user) {
      cart = await Cart.findOne({ user: req.user._id });
    } else {
      cart = await Cart.findOne({ sessionId });
    }

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    let subtotal = 0;
    const orderItems = [];

    for (const item of cart.items) {
      const product = await Product.findById(item.product);

      if (!product.inStock || product.stockQuantity < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${product.name}`
        });
      }

      const itemTotal = item.price * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        product: item.product,
        name: product.name,
        sku: product.sku,
        quantity: item.quantity,
        price: item.price,
        total: itemTotal
      });

      product.stockQuantity -= item.quantity;
      await Product.update({ _id: product._id }, product);
    }

    const tax = subtotal * 0.155;
    const total = subtotal + tax;

    const orderData = {
      isGuest: !req.user,
      user: req.user ? req.user._id : null,
      customerInfo,
      items: orderItems,
      subtotal,
      tax,
      total,
      paymentMethod,
      notes
    };

    switch (paymentMethod) {
      case 'cash_on_delivery':
        orderData.paymentStatus = 'payment_on_delivery';
        break;
      case 'collection':
        orderData.paymentStatus = 'payment_on_collection';
        break;
      case 'paynow':
        orderData.paymentStatus = 'awaiting_payment';
        break;
      default:
        orderData.paymentStatus = 'pending';
    }

    const order = await Order.insert(orderData);

    if (req.user) {
      await Cart.findOneAndDelete({ user: req.user._id });
    } else {
      await Cart.findOneAndDelete({ sessionId });
    }

    if (paymentMethod !== 'paynow') {
      try {
        await sendOrderConfirmationWithInvoice(order);
      } catch (emailError) {
        console.error('Failed to send order confirmation:', emailError);
      }
    }

    console.log('Γ£à Order created:', {
      orderNumber: order.orderNumber,
      orderId: order._id,
      isGuest: order.isGuest,
      paymentMethod: order.paymentMethod,
      email: order.customerInfo.email
    });

    res.status(201).json({
      message: 'Order created successfully',
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        isGuest: order.isGuest,
        customerInfo: order.customerInfo,
        items: order.items,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        status: order.status,
        createdAt: order.createdAt
      }
    });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/guest/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ message: 'Email is required for verification' });
    }

    console.log('≡ƒöì Guest order lookup:', { orderId, email });

    const order = await Order.findOne({
      _id: orderId,
      'customerInfo.email': email,
      isGuest: true
    });

    if (order) {
      await MongoShim.populate(order, 'items.product', Product, 'name images sku');
    }

    if (!order) {
      console.log('Γ¥î Order not found or email mismatch');
      return res.status(404).json({ message: 'Order not found' });
    }

    console.log('Γ£à Guest order found:', order.orderNumber);

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Γ¥î Guest order lookup error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const query = getCustomerOrderQuery(req.user);

    if (status) {
      query.$and = [...(query.$and || []), { status }];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    await MongoShim.populate(orders, 'items.product', Product, 'name images');

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

router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      $and: [
        { _id: req.params.id },
        getCustomerOrderQuery(req.user)
      ]
    });

    if (order) {
      await MongoShim.populate(order, 'items.product', Product, 'name images sku');
    }

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/track/:orderNumber/:email', async (req, res) => {
  try {
    const { orderNumber, email } = req.params;

    const order = await Order.findOne({
      orderNumber,
      'customerInfo.email': email
    });

    if (order) {
      await MongoShim.populate(order, 'items.product', Product, 'name images');
    }

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const trackingInfo = {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
      total: order.total,
      trackingNumber: order.trackingNumber,
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price
      }))
    };

    res.json(trackingInfo);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', auth, authorize('order_manager', 'super_admin'), async (req, res) => {
  try {
    const { status, paymentStatus, trackingNumber, notes } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const oldStatus = order.status;

    if (status) order.status = status;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    if (trackingNumber) order.trackingNumber = trackingNumber;
    if (notes !== undefined) order.notes = notes;

    await Order.update({ _id: order._id }, order);

    if (status && status !== oldStatus) {
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

router.delete('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (['shipped', 'delivered'].includes(order.status)) {
      return res.status(400).json({ message: 'Cannot cancel shipped or delivered orders' });
    }

    order.status = 'cancelled';
    await Order.update({ _id: order._id }, order);

    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (product) {
        product.stockQuantity += item.quantity;
        await Product.update({ _id: product._id }, product);
      }
    }

    res.json({ message: 'Order cancelled successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/user/stats', auth, async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments({ user: req.user._id });
    const pendingOrders = await Order.countDocuments({
      user: req.user._id,
      status: 'pending'
    });
    const completedOrders = await Order.countDocuments({
      user: req.user._id,
      status: 'delivered'
    });

    const totalSpent = await Order.aggregate([
      {
        $match: {
          user: req.user._id,
          paymentStatus: 'paid'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' }
        }
      }
    ]);

    res.json({
      totalOrders,
      pendingOrders,
      completedOrders,
      totalSpent: totalSpent[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
