const MongoShim = require('../utils/mongoshim');

const Cart = new MongoShim('carts', {
  timestamps: true,
  fields: {
    items: { default: [] },
    totalItems: { default: 0 },
    subtotal: { default: 0 },
    isGuest: { default: false }
  },
  preSave: (doc, isNew) => {
    if (!doc.user && !doc.sessionId) {
      throw new Error('Either user or sessionId must be provided');
    }
    doc.totalItems = (doc.items || []).reduce((total, item) => total + item.quantity, 0);
    doc.subtotal = (doc.items || []).reduce((total, item) => total + (item.price * item.quantity), 0);
  }
});

module.exports = Cart;
