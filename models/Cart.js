const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    sparse: true
  },
  sessionId: {
    type: String,
    sparse: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  totalItems: {
    type: Number,
    default: 0
  },
  subtotal: {
    type: Number,
    default: 0
  },
  isGuest: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Calculate totals before saving
cartSchema.pre('save', function(next) {
  this.totalItems = this.items.reduce((total, item) => total + item.quantity, 0);
  this.subtotal = this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
  next();
});

// Ensure either user or sessionId is provided
cartSchema.pre('save', function(next) {
  if (!this.user && !this.sessionId) {
    return next(new Error('Either user or sessionId must be provided'));
  }
  next();
});

module.exports = mongoose.model('Cart', cartSchema);