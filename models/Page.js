const slugify = require('slugify');
const MongoShim = require('../utils/mongoshim');

const Page = new MongoShim('pages', {
  timestamps: true,
  fields: {
    title: { default: '' },
    content: { default: '' },
    isPublished: { default: true },
    metaTitle: { default: '' },
    metaDescription: { default: '' },
    metaKeywords: { default: '' }
  },
  preSave: (doc, isNew) => {
    if (doc.title && !doc.slug) {
      doc.slug = slugify(doc.title, { lower: true });
    }
  }
});

module.exports = Page;
