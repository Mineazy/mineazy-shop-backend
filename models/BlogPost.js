const slugify = require('slugify');
const MongoShim = require('../utils/mongoshim');

const BlogPost = new MongoShim('blogposts', {
  timestamps: true,
  fields: {
    title: { default: '' },
    content: { default: '' },
    excerpt: { default: '' },
    tags: { default: [] },
    status: { default: 'draft' },
    viewCount: { default: 0 },
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

module.exports = BlogPost;
