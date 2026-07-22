const slugify = require('slugify');
const MongoShim = require('../utils/mongoshim');

const BlogCategory = new MongoShim('blogcategories', {
  timestamps: true,
  fields: {
    name: { default: '' },
    description: { default: '' },
    metaTitle: { default: '' },
    metaDescription: { default: '' }
  },
  preSave: (doc, isNew) => {
    if (doc.name && !doc.slug) {
      doc.slug = slugify(doc.name, { lower: true });
    }
  }
});

module.exports = BlogCategory;
