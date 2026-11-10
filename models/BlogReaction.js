const MongoShim = require('../utils/mongoshim');

// One like/dislike per reader per post. `key` is "<postId>:<voter>", where
// voter is "u:<userId>" for signed-in readers or "v:<visitorId>" for guests.
const BlogReaction = new MongoShim('blogreactions', {
  timestamps: true,
  indexes: { fieldName: 'key', unique: true },
  fields: {
    post: { default: null },
    key: { default: '' },
    type: { default: 'like' }
  }
});

module.exports = BlogReaction;
