const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  transactionId: {
    type: String,
    unique: true,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['paynow', 'cash_on_delivery', 'collection'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  paynowData: {
    pollUrl: String,
    reference: String,
    status: String
  },
  failureReason: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Transaction', transactionSchema);