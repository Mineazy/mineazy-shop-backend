const mongoose = require('mongoose');
const crypto = require('crypto');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true,
    default: function() {
      // Format: ORD-YYYYMMDD-RANDOM
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
      const random = crypto.randomBytes(3).toString('hex').toUpperCase();
      return `ORD-${dateStr}-${random}`;
    }
  },
  isGuest: {
    type: Boolean,
    default: false
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  customerInfo: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: String,
      zipCode: String,
      country: { type: String, required: true }
    }
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: String, // Store product name at time of order
    sku: String,   // Store SKU at time of order
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true
    },
    total: {
      type: Number,
      required: true
    }
  }],
  subtotal: {
    type: Number,
    required: true
  },
  tax: {
    type: Number,
    default: 0
  },
  shipping: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'awaiting_payment', 'payment_on_delivery', 'payment_on_collection'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['paynow', 'cash_on_delivery', 'collection'],
    required: true
  },
  paynowReference: String,
  notes: String,
  trackingNumber: String
}, {
  timestamps: true
});

// Backup generation in pre-save hook (in case default fails)
orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    this.orderNumber = `ORD-${dateStr}-${random}`;
    
    // Ensure uniqueness - if by rare chance it exists, regenerate
    let attempts = 0;
    while (attempts < 5) {
      const exists = await mongoose.model('Order').findOne({ orderNumber: this.orderNumber });
      if (!exists) break;
      
      // Regenerate with more random bytes
      const newRandom = crypto.randomBytes(4).toString('hex').toUpperCase();
      this.orderNumber = `ORD-${dateStr}-${newRandom}`;
      attempts++;
    }
  }
  next();
});

// Index for faster queries
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ 'customerInfo.email': 1 });
orderSchema.index({ user: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });

// Virtual for order age in days
orderSchema.virtual('orderAge').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  const diffTime = Math.abs(now - created);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Method to check if order can be cancelled
orderSchema.methods.canBeCancelled = function() {
  return !['shipped', 'delivered', 'cancelled'].includes(this.status);
};

// Method to check if order is overdue (for COD/Collection)
orderSchema.methods.isOverdue = function() {
  if (!['payment_on_delivery', 'payment_on_collection'].includes(this.paymentStatus)) {
    return false;
  }
  const daysSinceOrder = this.orderAge;
  return daysSinceOrder > 7; // Consider overdue after 7 days
};

// Static method to generate order number (can be called manually)
orderSchema.statics.generateOrderNumber = function() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${dateStr}-${random}`;
};

// Static method to find orders by date range
orderSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    createdAt: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).sort({ createdAt: -1 });
};

// Static method to get order statistics
orderSchema.statics.getOrderStats = async function() {
  const totalOrders = await this.countDocuments();
  const pendingOrders = await this.countDocuments({ status: 'pending' });
  const completedOrders = await this.countDocuments({ status: 'delivered' });
  const cancelledOrders = await this.countDocuments({ status: 'cancelled' });
  
  const totalRevenue = await this.aggregate([
    { $match: { paymentStatus: 'paid' } },
    { $group: { _id: null, total: { $sum: '$total' } } }
  ]);
  
  return {
    totalOrders,
    pendingOrders,
    completedOrders,
    cancelledOrders,
    totalRevenue: totalRevenue[0]?.total || 0
  };
};

module.exports = mongoose.model('Order', orderSchema);