const MongoShim = require('../utils/mongoshim');

// Reader comments on blog posts. New comments from readers start as
// 'pending' and only appear on the site once an admin approves them.
const BlogComment = new MongoShim('blogcomments', {
  timestamps: true,
  fields: {
    post: { default: null },
    user: { default: null },
    name: { default: '' },
    email: { default: '' },
    content: { default: '' },
    status: { default: 'pending' }
  }
});

module.exports = BlogComment;
