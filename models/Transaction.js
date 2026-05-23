const MongoShim = require('../utils/mongoshim');

const Transaction = new MongoShim('transactions', {
  timestamps: true,
  fields: {
    transactionId: { default: '' },
    paymentMethod: { default: '' },
    status: { default: 'pending' },
    amount: { default: 0 },
    currency: { default: 'USD' },
    paynowData: { default: {} }
  }
});

module.exports = Transaction;
