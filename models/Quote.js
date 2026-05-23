const MongoShim = require('../utils/mongoshim');

const Quote = new MongoShim('quotes', {
  timestamps: true,
  fields: {
    quoteNumber: { default: '' },
    customerInfo: { default: {} },
    items: { default: [] },
    subtotal: { default: 0 },
    tax: { default: 0 },
    total: { default: 0 },
    status: { default: 'draft' }
  },
  preSave: async (doc, isNew) => {
    if (isNew && !doc.quoteNumber) {
      const all = await Quote.find({});
      const count = all.length;
      doc.quoteNumber = `QT-${Date.now()}-${(count + 1).toString().padStart(4, '0')}`;
    }
  }
});

module.exports = Quote;
