const mongoose = require('mongoose');
const slugify = require('slugify');

const blogCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  slug: {
    type: String,
    unique: true
  },
  description: String
}, {
  timestamps: true
});

// Generate slug before saving
blogCategorySchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true });
  }
  next();
});

module.exports = mongoose.model('BlogCategory', blogCategorySchema);