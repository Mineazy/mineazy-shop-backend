const express = require('express');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { auth, optionalAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Helper function to get or create cart
const getOrCreateCart = async (user, sessionId) => {
  let cart;
  
  if (user) {
    cart = await Cart.findOne({ user: user._id }).populate('items.product');
  } else {
    cart = await Cart.findOne({ sessionId }).populate('items.product');
  }

  if (!cart) {
    cart = new Cart({
      user: user ? user._id : null,
      sessionId: user ? null : sessionId,
      isGuest: !user,
      items: []
    });
  }

  return cart;
};

// @route   GET /api/cart
// @desc    Get user's cart
// @access  Public (with optional auth)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || uuidv4();
    const cart = await getOrCreateCart(req.user, sessionId);

    res.json({
      cart,
      sessionId: !req.user ? sessionId : undefined
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/cart/items
// @desc    Add item to cart
// @access  Public (with optional auth)
router.post('/items', optionalAuth, async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const sessionId = req.headers['x-session-id'] || uuidv4();

    // Validate product
    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (!product.inStock || product.stockQuantity < quantity) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }

    const cart = await getOrCreateCart(req.user, sessionId);

    // Check if item already exists in cart
    const existingItem = cart.items.find(item => 
      item.product._id.toString() === productId
    );

    if (existingItem) {
      // Update quantity
      existingItem.quantity += quantity;
      if (existingItem.quantity > product.stockQuantity) {
        existingItem.quantity = product.stockQuantity;
      }
    } else {
      // Add new item
      cart.items.push({
        product: productId,
        quantity,
        price: product.effectivePrice
      });
    }

    await cart.save();
    await cart.populate('items.product');

    res.json({
      message: 'Item added to cart',
      cart,
      sessionId: !req.user ? sessionId : undefined
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/cart/items/:id
// @desc    Update cart item quantity
// @access  Public (with optional auth)
router.put('/items/:id', optionalAuth, async (req, res) => {
  try {
    const { quantity } = req.body;
    const sessionId = req.headers['x-session-id'];

    const cart = await getOrCreateCart(req.user, sessionId);
    const item = cart.items.id(req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    // Validate stock
    const product = await Product.findById(item.product);
    if (quantity > product.stockQuantity) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }

    item.quantity = quantity;
    await cart.save();
    await cart.populate('items.product');

    res.json({
      message: 'Cart updated',
      cart
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/cart/items/:id/increment
// @desc    Increment item quantity
// @access  Public (with optional auth)
router.put('/items/:id/increment', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = await getOrCreateCart(req.user, sessionId);
    const item = cart.items.id(req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    const product = await Product.findById(item.product);
    if (item.quantity >= product.stockQuantity) {
      return res.status(400).json({ message: 'Maximum stock reached' });
    }

    item.quantity += 1;
    await cart.save();
    await cart.populate('items.product');

    res.json({ cart });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/cart/items/:id/decrement
// @desc    Decrement item quantity
// @access  Public (with optional auth)
router.put('/items/:id/decrement', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = await getOrCreateCart(req.user, sessionId);
    const item = cart.items.id(req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    if (item.quantity <= 1) {
      cart.items.pull(req.params.id);
    } else {
      item.quantity -= 1;
    }

    await cart.save();
    await cart.populate('items.product');

    res.json({ cart });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/cart/items/:id
// @desc    Remove item from cart
// @access  Public (with optional auth)
router.delete('/items/:id', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = await getOrCreateCart(req.user, sessionId);

    cart.items.pull(req.params.id);
    await cart.save();
    await cart.populate('items.product');

    res.json({
      message: 'Item removed from cart',
      cart
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/cart
// @desc    Clear cart
// @access  Public (with optional auth)
router.delete('/', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = await getOrCreateCart(req.user, sessionId);

    cart.items = [];
    await cart.save();

    res.json({
      message: 'Cart cleared',
      cart
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/cart/count
// @desc    Get cart items count
// @access  Public (with optional auth)
router.get('/count', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = await getOrCreateCart(req.user, sessionId);

    res.json({ count: cart.totalItems });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/cart/merge
// @desc    Merge guest cart with user cart after login
// @access  Private
router.post('/merge', auth, async (req, res) => {
  try {
    const { guestSessionId } = req.body;

    if (!guestSessionId) {
      return res.status(400).json({ message: 'Guest session ID required' });
    }

    // Get guest cart
    const guestCart = await Cart.findOne({ sessionId: guestSessionId }).populate('items.product');
    if (!guestCart || guestCart.items.length === 0) {
      return res.json({ message: 'No guest cart to merge' });
    }

    // Get or create user cart
    let userCart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    if (!userCart) {
      userCart = new Cart({
        user: req.user._id,
        isGuest: false,
        items: []
      });
    }

    // Merge items
    for (const guestItem of guestCart.items) {
      const existingItem = userCart.items.find(item => 
        item.product._id.toString() === guestItem.product._id.toString()
      );

      if (existingItem) {
        // Update quantity
        existingItem.quantity += guestItem.quantity;
        
        // Check stock limit
        const product = await Product.findById(guestItem.product._id);
        if (existingItem.quantity > product.stockQuantity) {
          existingItem.quantity = product.stockQuantity;
        }
      } else {
        // Add new item
        userCart.items.push({
          product: guestItem.product._id,
          quantity: guestItem.quantity,
          price: guestItem.price
        });
      }
    }

    await userCart.save();
    await userCart.populate('items.product');

    // Delete guest cart
    await Cart.findByIdAndDelete(guestCart._id);

    res.json({
      message: 'Carts merged successfully',
      cart: userCart
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/cart/validate
// @desc    Validate cart items (stock, price, availability)
// @access  Public (with optional auth)
router.post('/validate', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = await getOrCreateCart(req.user, sessionId);

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    const validationResults = {
      isValid: true,
      errors: [],
      updates: []
    };

    for (const item of cart.items) {
      const product = await Product.findById(item.product._id);
      
      if (!product || !product.isActive) {
        validationResults.isValid = false;
        validationResults.errors.push({
          itemId: item._id,
          productId: item.product._id,
          error: 'Product no longer available'
        });
        continue;
      }

      if (!product.inStock || product.stockQuantity === 0) {
        validationResults.isValid = false;
        validationResults.errors.push({
          itemId: item._id,
          productId: item.product._id,
          error: 'Product out of stock'
        });
        continue;
      }

      if (product.stockQuantity < item.quantity) {
        validationResults.isValid = false;
        validationResults.errors.push({
          itemId: item._id,
          productId: item.product._id,
          error: `Only ${product.stockQuantity} items available`
        });
        continue;
      }

      // Check for price changes
      const currentPrice = product.effectivePrice;
      if (item.price !== currentPrice) {
        item.price = currentPrice;
        validationResults.updates.push({
          itemId: item._id,
          productId: item.product._id,
          oldPrice: item.price,
          newPrice: currentPrice,
          message: 'Price updated'
        });
      }
    }

    if (validationResults.updates.length > 0) {
      await cart.save();
      await cart.populate('items.product');
    }

    res.json({
      ...validationResults,
      cart: validationResults.updates.length > 0 ? cart : undefined
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/cart/save-for-later/:id
// @desc    Save cart item for later (move to wishlist)
// @access  Private
router.post('/save-for-later/:id', auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    const item = cart.items.id(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    // In a real implementation, you would move this to a wishlist
    // For now, we'll just remove it from cart
    cart.items.pull(req.params.id);
    await cart.save();

    res.json({
      message: 'Item saved for later',
      cart
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/cart/summary
// @desc    Get cart summary (totals, item count, etc.)
// @access  Public (with optional auth)
router.get('/summary', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = await getOrCreateCart(req.user, sessionId);

    const summary = {
      itemCount: cart.totalItems,
      subtotal: cart.subtotal,
      estimatedTax: cart.subtotal * 0.155, // 15.5% VAT
      estimatedTotal: cart.subtotal + (cart.subtotal * 0.155),
      hasItems: cart.items.length > 0
    };

    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
