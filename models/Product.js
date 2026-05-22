const mongoose = require('mongoose');
const slugify = require('slugify');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  shortDescription: {
    type: String,
    maxlength: 200
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  salePrice: {
    type: Number,
    min: 0
  },
  sku: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  images: [{
    type: String
  }],
  specifications: {
    type: Map,
    of: String
  },
  inStock: {
    type: Boolean,
    default: true
  },
  stockQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  weight: {
    type: Number,
    min: 0
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number
  },
  tags: [{
    type: String,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  featured: {
    type: Boolean,
    default: false
  },
  viewCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Generate slug before saving
productSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true });
  }
  next();
});

// Virtual for effective price
productSchema.virtual('effectivePrice').get(function() {
  return this.salePrice && this.salePrice < this.price ? this.salePrice : this.price;
});

// Text search index
productSchema.index({ 
  name: 'text', 
  description: 'text', 
  tags: 'text' 
});

module.exports = mongoose.model('Product', productSchema);