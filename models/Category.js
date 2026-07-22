const slugify = require('slugify');
const MongoShim = require('../utils/mongoshim');

const Category = new MongoShim('categories', {
  timestamps: true,
  fields: {
    name: { default: '' },
    description: { default: '' },
    isActive: { default: true },
    sortOrder: { default: 0 },
    metaTitle: { default: '' },
    metaDescription: { default: '' },
    metaKeywords: { default: '' }
  },
  preSave: (doc, isNew) => {
    if (doc.name && !doc.slug) {
      doc.slug = slugify(doc.name, { lower: true });
    }
  }
});

module.exports = Category;
