const express = require('express');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const MongoShim = require('../utils/mongoshim');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/validate', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];

    let cart;
    if (req.user) {
      cart = await Cart.findOne({ user: req.user._id });
    } else {
      cart = await Cart.findOne({ sessionId });
    }

    if (cart) {
      await MongoShim.populate(cart, 'items.product', Product);
    }

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    const validationErrors = [];
    let subtotal = 0;

    for (const item of cart.items) {
      const product = await Product.findById(item.product._id);

      if (!product || !product.isActive) {
        validationErrors.push({
          item: item._id,
          error: 'Product no longer available'
        });
        continue;
      }

      if (!product.inStock || product.stockQuantity < item.quantity) {
        validationErrors.push({
          item: item._id,
          error: `Only ${product.stockQuantity} items in stock`
        });
        continue;
      }

      const currentPrice = product.effectivePrice;
      if (item.price !== currentPrice) {
        item.price = currentPrice;
      }

      subtotal += item.price * item.quantity;
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: 'Cart validation failed',
        errors: validationErrors
      });
    }

    cart.totalItems = cart.items.reduce((t, i) => t + i.quantity, 0);
    cart.subtotal = cart.items.reduce((t, i) => t + (i.price * i.quantity), 0);
    await Cart.update({ _id: cart._id }, cart);

    res.json({
      message: 'Cart validated successfully',
      cart,
      subtotal
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/calculate', optionalAuth, async (req, res) => {
  try {
    const { shippingAddress } = req.body;
    const sessionId = req.headers['x-session-id'];

    let cart;
    if (req.user) {
      cart = await Cart.findOne({ user: req.user._id });
    } else {
      cart = await Cart.findOne({ sessionId });
    }

    if (cart) {
      await MongoShim.populate(cart, 'items.product', Product);
    }

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    let subtotal = 0;
    for (const item of cart.items) {
      subtotal += item.price * item.quantity;
    }

    const taxRate = 0.155;
    const tax = subtotal * taxRate;

    let shipping = 0;
    if (shippingAddress && shippingAddress.country !== 'Zimbabwe') {
      shipping = subtotal * 0.1;
    } else if (subtotal < 100) {
      shipping = 10;
    }

    const total = subtotal + tax + shipping;

    res.json({
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      shipping: parseFloat(shipping.toFixed(2)),
      total: parseFloat(total.toFixed(2))
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/validate-address', async (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ message: 'Address is required' });
    }

    const { street, city, country } = address;

    if (!street || !city || !country) {
      return res.status(400).json({
        message: 'Street, city, and country are required'
      });
    }

    const validationErrors = [];

    if (street.length < 5) {
      validationErrors.push('Street address must be at least 5 characters');
    }

    if (city.length < 2) {
      validationErrors.push('City must be at least 2 characters');
    }

    if (country.length < 2) {
      validationErrors.push('Country must be at least 2 characters');
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: 'Address validation failed',
        errors: validationErrors
      });
    }

    res.json({
      message: 'Address is valid',
      address
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/validate-customer', async (req, res) => {
  try {
    const { customerInfo } = req.body;

    if (!customerInfo) {
      return res.status(400).json({ message: 'Customer information is required' });
    }

    const { firstName, lastName, email, phone, address } = customerInfo;

    const validationErrors = [];

    if (!firstName || firstName.trim().length < 1) {
      validationErrors.push('First name is required');
    }

    if (!lastName || lastName.trim().length < 1) {
      validationErrors.push('Last name is required');
    }

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      validationErrors.push('Valid email is required');
    }

    if (!phone || phone.trim().length < 10) {
      validationErrors.push('Valid phone number is required');
    }

    if (!address || !address.street || !address.city || !address.country) {
      validationErrors.push('Complete address is required');
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: 'Customer information validation failed',
        errors: validationErrors
      });
    }

    res.json({
      message: 'Customer information is valid',
      customerInfo
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/guest', async (req, res) => {
  try {
    const {
      customerInfo,
      paymentMethod,
      sessionId
    } = req.body;

    if (!customerInfo || !paymentMethod || !sessionId) {
      return res.status(400).json({ message: 'Missing required checkout information' });
    }

    const cart = await Cart.findOne({ sessionId });

    if (cart) {
      await MongoShim.populate(cart, 'items.product', Product);
    }

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    for (const item of cart.items) {
      const product = await Product.findById(item.product._id);
      if (!product.inStock || product.stockQuantity < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${product.name}`
        });
      }
    }

    res.json({
      message: 'Guest checkout validated',
      cart,
      customerInfo,
      paymentMethod
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/shipping-methods', async (req, res) => {
  try {
    const { country, total = 0 } = req.query;

    const shippingMethods = [];

    if (country === 'Zimbabwe') {
      shippingMethods.push({
        id: 'standard-zw',
        name: 'Standard Delivery',
        description: '3-5 business days',
        cost: total < 100 ? 10 : 0,
        estimatedDays: '3-5'
      });

      shippingMethods.push({
        id: 'express-zw',
        name: 'Express Delivery',
        description: '1-2 business days',
        cost: 25,
        estimatedDays: '1-2'
      });

      shippingMethods.push({
        id: 'collection',
        name: 'Collection',
        description: 'Pick up from our location',
        cost: 0,
        estimatedDays: '0'
      });
    } else {
      shippingMethods.push({
        id: 'international',
        name: 'International Shipping',
        description: '7-14 business days',
        cost: total * 0.1,
        estimatedDays: '7-14'
      });
    }

    res.json(shippingMethods);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/apply-coupon', optionalAuth, async (req, res) => {
  try {
    const { couponCode } = req.body;
    const sessionId = req.headers['x-session-id'];

    if (!couponCode) {
      return res.status(400).json({ message: 'Coupon code is required' });
    }

    const mockCoupons = {
      'SAVE10': { discount: 0.10, type: 'percentage', minOrder: 50 },
      'WELCOME5': { discount: 5, type: 'fixed', minOrder: 0 },
      'BULK20': { discount: 0.20, type: 'percentage', minOrder: 200 }
    };

    const coupon = mockCoupons[couponCode.toUpperCase()];

    if (!coupon) {
      return res.status(404).json({ message: 'Invalid coupon code' });
    }

    let cart;
    if (req.user) {
      cart = await Cart.findOne({ user: req.user._id });
    } else {
      cart = await Cart.findOne({ sessionId });
    }

    if (!cart) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    if (cart.subtotal < coupon.minOrder) {
      return res.status(400).json({
        message: `Minimum order of $${coupon.minOrder} required for this coupon`
      });
    }

    let discountAmount = 0;
    if (coupon.type === 'percentage') {
      discountAmount = cart.subtotal * coupon.discount;
    } else {
      discountAmount = coupon.discount;
    }

    res.json({
      message: 'Coupon applied successfully',
      coupon: {
        code: couponCode.toUpperCase(),
        discount: coupon.discount,
        type: coupon.type,
        discountAmount: parseFloat(discountAmount.toFixed(2))
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
