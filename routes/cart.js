const express = require('express');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const MongoShim = require('../utils/mongoshim');
const { auth, optionalAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const router = express.Router();

const genItemId = () => crypto.randomBytes(12).toString('hex');

const getOrCreateCart = async (user, sessionId) => {
  let cart;

  if (user) {
    cart = await Cart.findOne({ user: user._id });
  } else {
    cart = await Cart.findOne({ sessionId });
  }

  if (!cart) {
    cart = await Cart.insert({
      user: user ? user._id : null,
      sessionId: user ? null : sessionId,
      isGuest: !user,
      items: []
    });
  }

  return cart;
};

router.get('/', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || uuidv4();
    const cart = await getOrCreateCart(req.user, sessionId);

    if (cart.items && cart.items.length > 0) {
      await MongoShim.populate(cart, 'items.product', Product);
    }

    res.json({
      cart,
      sessionId: !req.user ? sessionId : undefined
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/items', optionalAuth, async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const sessionId = req.headers['x-session-id'] || uuidv4();

    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (!product.inStock || product.stockQuantity < quantity) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }

    let cart = await getOrCreateCart(req.user, sessionId);

    const existingItem = cart.items.find(item => item.product === productId);

    if (existingItem) {
      existingItem.quantity += quantity;
      if (existingItem.quantity > product.stockQuantity) {
        existingItem.quantity = product.stockQuantity;
      }
    } else {
      const itemPrice = product.salePrice && product.salePrice < product.price ? product.salePrice : product.price;
      cart.items = [...(cart.items || []), {
        _id: genItemId(),
        product: productId,
        quantity,
        price: itemPrice
      }];
    }

    cart.totalItems = cart.items.reduce((t, i) => t + i.quantity, 0);
    cart.subtotal = cart.items.reduce((t, i) => t + (i.price * i.quantity), 0);
    await Cart.update({ _id: cart._id }, cart);
    await MongoShim.populate(cart, 'items.product', Product);

    res.json({
      message: 'Item added to cart',
      cart,
      sessionId: !req.user ? sessionId : undefined
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/items/:id', optionalAuth, async (req, res) => {
  try {
    const { quantity } = req.body;
    const sessionId = req.headers['x-session-id'];

    const cart = await getOrCreateCart(req.user, sessionId);
    const item = cart.items.find(i => i._id === req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    const product = await Product.findById(item.product);
    if (quantity > product.stockQuantity) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }

    item.quantity = quantity;
    cart.totalItems = cart.items.reduce((t, i) => t + i.quantity, 0);
    cart.subtotal = cart.items.reduce((t, i) => t + (i.price * i.quantity), 0);
    await Cart.update({ _id: cart._id }, cart);
    await MongoShim.populate(cart, 'items.product', Product);

    res.json({
      message: 'Cart updated',
      cart
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/items/:id/increment', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = await getOrCreateCart(req.user, sessionId);
    const item = cart.items.find(i => i._id === req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    const product = await Product.findById(item.product);
    if (item.quantity >= product.stockQuantity) {
      return res.status(400).json({ message: 'Maximum stock reached' });
    }

    item.quantity += 1;
    cart.totalItems = cart.items.reduce((t, i) => t + i.quantity, 0);
    cart.subtotal = cart.items.reduce((t, i) => t + (i.price * i.quantity), 0);
    await Cart.update({ _id: cart._id }, cart);
    await MongoShim.populate(cart, 'items.product', Product);

    res.json({ cart });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/items/:id/decrement', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = await getOrCreateCart(req.user, sessionId);
    const item = cart.items.find(i => i._id === req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    if (item.quantity <= 1) {
      cart.items = cart.items.filter(i => i._id !== req.params.id);
    } else {
      item.quantity -= 1;
    }

    cart.totalItems = cart.items.reduce((t, i) => t + i.quantity, 0);
    cart.subtotal = cart.items.reduce((t, i) => t + (i.price * i.quantity), 0);
    await Cart.update({ _id: cart._id }, cart);
    await MongoShim.populate(cart, 'items.product', Product);

    res.json({ cart });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/items/:id', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = await getOrCreateCart(req.user, sessionId);

    cart.items = cart.items.filter(i => i._id !== req.params.id);
    cart.totalItems = cart.items.reduce((t, i) => t + i.quantity, 0);
    cart.subtotal = cart.items.reduce((t, i) => t + (i.price * i.quantity), 0);
    await Cart.update({ _id: cart._id }, cart);
    await MongoShim.populate(cart, 'items.product', Product);

    res.json({
      message: 'Item removed from cart',
      cart
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = await getOrCreateCart(req.user, sessionId);

    cart.items = [];
    cart.totalItems = 0;
    cart.subtotal = 0;
    await Cart.update({ _id: cart._id }, cart);

    res.json({
      message: 'Cart cleared',
      cart
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/count', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = await getOrCreateCart(req.user, sessionId);

    res.json({ count: cart.totalItems });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/merge', auth, async (req, res) => {
  try {
    const { guestSessionId } = req.body;

    if (!guestSessionId) {
      return res.status(400).json({ message: 'Guest session ID required' });
    }

    const guestCart = await Cart.findOne({ sessionId: guestSessionId });
    if (!guestCart || !guestCart.items || guestCart.items.length === 0) {
      return res.json({ message: 'No guest cart to merge' });
    }

    let userCart = await Cart.findOne({ user: req.user._id });
    if (!userCart) {
      userCart = await Cart.insert({
        user: req.user._id,
        isGuest: false,
        items: []
      });
    }

    for (const guestItem of guestCart.items) {
      const existingItem = userCart.items.find(item => item.product === guestItem.product);

      if (existingItem) {
        existingItem.quantity += guestItem.quantity;

        const product = await Product.findById(guestItem.product);
        if (existingItem.quantity > product.stockQuantity) {
          existingItem.quantity = product.stockQuantity;
        }
      } else {
        userCart.items = [...(userCart.items || []), {
          _id: genItemId(),
          product: guestItem.product,
          quantity: guestItem.quantity,
          price: guestItem.price
        }];
      }
    }

    userCart.totalItems = userCart.items.reduce((t, i) => t + i.quantity, 0);
    userCart.subtotal = userCart.items.reduce((t, i) => t + (i.price * i.quantity), 0);
    await Cart.update({ _id: userCart._id }, userCart);
    await MongoShim.populate(userCart, 'items.product', Product);
    await Cart.findByIdAndDelete(guestCart._id);

    res.json({
      message: 'Carts merged successfully',
      cart: userCart
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/validate', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = await getOrCreateCart(req.user, sessionId);

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    const validationResults = {
      isValid: true,
      errors: [],
      updates: []
    };

    for (const item of cart.items) {
      const product = await Product.findById(item.product);

      if (!product || !product.isActive) {
        validationResults.isValid = false;
        validationResults.errors.push({
          itemId: item._id,
          productId: item.product,
          error: 'Product no longer available'
        });
        continue;
      }

      if (!product.inStock || product.stockQuantity === 0) {
        validationResults.isValid = false;
        validationResults.errors.push({
          itemId: item._id,
          productId: item.product,
          error: 'Product out of stock'
        });
        continue;
      }

      if (product.stockQuantity < item.quantity) {
        validationResults.isValid = false;
        validationResults.errors.push({
          itemId: item._id,
          productId: item.product,
          error: `Only ${product.stockQuantity} items available`
        });
        continue;
      }

      const currentPrice = product.salePrice && product.salePrice < product.price ? product.salePrice : product.price;
      if (item.price !== currentPrice) {
        item.price = currentPrice;
        validationResults.updates.push({
          itemId: item._id,
          productId: item.product,
          oldPrice: item.price,
          newPrice: currentPrice,
          message: 'Price updated'
        });
      }
    }

    if (validationResults.updates.length > 0) {
      cart.totalItems = cart.items.reduce((t, i) => t + i.quantity, 0);
      cart.subtotal = cart.items.reduce((t, i) => t + (i.price * i.quantity), 0);
      await Cart.update({ _id: cart._id }, cart);
      await MongoShim.populate(cart, 'items.product', Product);
    }

    res.json({
      ...validationResults,
      cart: validationResults.updates.length > 0 ? cart : undefined
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/save-for-later/:id', auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    const item = cart.items.find(i => i._id === req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    cart.items = cart.items.filter(i => i._id !== req.params.id);
    cart.totalItems = cart.items.reduce((t, i) => t + i.quantity, 0);
    cart.subtotal = cart.items.reduce((t, i) => t + (i.price * i.quantity), 0);
    await Cart.update({ _id: cart._id }, cart);

    res.json({
      message: 'Item saved for later',
      cart
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/summary', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = await getOrCreateCart(req.user, sessionId);

    const summary = {
      itemCount: cart.totalItems,
      subtotal: cart.subtotal,
      estimatedTax: cart.subtotal * 0.155,
      estimatedTotal: cart.subtotal + (cart.subtotal * 0.155),
      hasItems: cart.items.length > 0
    };

    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
