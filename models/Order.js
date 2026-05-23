const crypto = require('crypto');
const MongoShim = require('../utils/mongoshim');

const Order = new MongoShim('orders', {
  timestamps: true,
  fields: {
    orderNumber: { default: '' },
    isGuest: { default: false },
    items: { default: [] },
    subtotal: { default: 0 },
    tax: { default: 0 },
    shipping: { default: 0 },
    total: { default: 0 },
    status: { default: 'pending' },
    paymentStatus: { default: 'pending' },
    paymentMethod: { default: '' },
    customerInfo: { default: {} }
  },
  preSave: async (doc, isNew) => {
    if (isNew && !doc.orderNumber) {
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
      const random = crypto.randomBytes(3).toString('hex').toUpperCase();
      doc.orderNumber = `ORD-${dateStr}-${random}`;
    }
  }
});

Order.orderAge = function (doc) {
  const now = new Date();
  const created = new Date(doc.createdAt);
  const diffTime = Math.abs(now - created);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

Order.canBeCancelled = function (doc) {
  return !['shipped', 'delivered', 'cancelled'].includes(doc.status);
};

Order.isOverdue = function (doc) {
  if (!['payment_on_delivery', 'payment_on_collection'].includes(doc.paymentStatus)) return false;
  return Order.orderAge(doc) > 7;
};

Order.generateOrderNumber = function () {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${dateStr}-${random}`;
};

Order.findByDateRange = function (startDate, endDate) {
  return Order.find({
    createdAt: { $gte: new Date(startDate).toISOString(), $lte: new Date(endDate).toISOString() }
  });
};

Order.getOrderStats = async function () {
  const allOrders = await Order.find({});
  const totalOrders = allOrders.length;
  const pendingOrders = allOrders.filter(o => o.status === 'pending').length;
  const completedOrders = allOrders.filter(o => o.status === 'delivered').length;
  const cancelledOrders = allOrders.filter(o => o.status === 'cancelled').length;
  const totalRevenue = allOrders
    .filter(o => o.paymentStatus === 'paid')
    .reduce((sum, o) => sum + (o.total || 0), 0);
  return { totalOrders, pendingOrders, completedOrders, cancelledOrders, totalRevenue };
};

module.exports = Order;
