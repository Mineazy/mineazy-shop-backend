const slugify = require('slugify');
const MongoShim = require('../utils/mongoshim');

const Product = new MongoShim('products', {
  timestamps: true,
  fields: {
    name: { default: '' },
    description: { default: '' },
    price: { default: 0 },
    sku: { default: '' },
    category: { default: null },
    inStock: { default: true },
    stockQuantity: { default: 0 },
    isActive: { default: true },
    featured: { default: false },
    viewCount: { default: 0 }
  },
  preSave: (doc, isNew) => {
    if (doc.name && !doc.slug) {
      doc.slug = slugify(doc.name, { lower: true });
    }
  }
});

Product.effectivePrice = function (doc) {
  return doc.salePrice && doc.salePrice < doc.price ? doc.salePrice : doc.price;
};

module.exports = Product;
