const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
  quoteNumber: {
    type: String,
    unique: true,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  customerInfo: {
    firstName: String,
    lastName: String,
    email: String,
    phone: String,
    company: String
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    quantity: Number,
    unitPrice: Number,
    totalPrice: Number,
    customItem: {
      name: String,
      description: String
    }
  }],
  subtotal: Number,
  tax: Number,
  total: Number,
  status: {
    type: String,
    enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'],
    default: 'draft'
  },
  validUntil: Date,
  notes: String,
  salesRep: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Generate quote number before saving
quoteSchema.pre('save', async function(next) {
  if (!this.quoteNumber) {
    const count = await mongoose.model('Quote').countDocuments();
    this.quoteNumber = `QT-${Date.now()}-${(count + 1).toString().padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Quote', quoteSchema);