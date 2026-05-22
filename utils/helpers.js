const slugify = require('slugify');
const crypto = require('crypto');

class Helpers {
  // Generate unique slug
  static generateSlug(text, existingCheck = null) {
    let baseSlug = slugify(text, { 
      lower: true, 
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });
    
    if (!existingCheck) return baseSlug;
    
    // If existingCheck function provided, ensure uniqueness
    let slug = baseSlug;
    let counter = 1;
    
    while (existingCheck(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    return slug;
  }

  // Generate random token
  static generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Generate order number
  static generateOrderNumber() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `ORD-${timestamp.slice(-6)}${random}`;
  }

  // Generate quote number
  static generateQuoteNumber() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `QT-${timestamp.slice(-6)}${random}`;
  }

  // Format currency
  static formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  // Format date
  static formatDate(date, format = 'short') {
    const options = {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      long: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' },
      time: { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }
    };

    return new Intl.DateTimeFormat('en-US', options[format]).format(new Date(date));
  }

  // Validate email
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validate phone number
  static isValidPhone(phone) {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  }

  // Sanitize filename
  static sanitizeFilename(filename) {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  // Generate pagination info
  static getPagination(page, limit, total) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const totalPages = Math.ceil(total / limitNum);
    
    return {
      currentPage: pageNum,
      limit: limitNum,
      totalPages,
      totalItems: total,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
      skip: (pageNum - 1) * limitNum
    };
  }

  // Calculate order totals
  static calculateOrderTotals(items, taxRate = 0.155, shippingCost = 0) {
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * taxRate;
    const total = subtotal + tax + shippingCost;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      shipping: Math.round(shippingCost * 100) / 100,
      total: Math.round(total * 100) / 100
    };
  }

  // Escape HTML
  static escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  // Parse query filters
  static parseFilters(query) {
    const filters = {};
    
    // Price range
    if (query.minPrice || query.maxPrice) {
      filters.price = {};
      if (query.minPrice) filters.price.$gte = parseFloat(query.minPrice);
      if (query.maxPrice) filters.price.$lte = parseFloat(query.maxPrice);
    }

    // Boolean filters
    if (query.inStock === 'true') {
      filters.inStock = true;
      filters.stockQuantity = { $gt: 0 };
    }

    if (query.featured === 'true') {
      filters.featured = true;
    }

    if (query.isActive !== undefined) {
      filters.isActive = query.isActive === 'true';
    }

    // Text search
    if (query.search) {
      filters.$text = { $search: query.search };
    }

    // Category filter
    if (query.category) {
      filters.category = query.category;
    }

    // Date range
    if (query.startDate || query.endDate) {
      filters.createdAt = {};
      if (query.startDate) filters.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) filters.createdAt.$lte = new Date(query.endDate);
    }

    return filters;
  }

  // Parse sort options
  static parseSort(sortBy = 'createdAt', sortOrder = 'desc') {
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    return sort;
  }

  // Validate required fields
  static validateRequiredFields(data, requiredFields) {
    const errors = [];
    
    requiredFields.forEach(field => {
      if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
        errors.push(`${field} is required`);
      }
    });

    return errors;
  }

  // Generate password hash (for non-user passwords)
  static generateHash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // Verify hash
  static verifyHash(data, hash) {
    return this.generateHash(data) === hash;
  }

  // Calculate discount
  static calculateDiscount(originalPrice, discountPercent) {
    const discountAmount = originalPrice * (discountPercent / 100);
    return {
      discountAmount: Math.round(discountAmount * 100) / 100,
      finalPrice: Math.round((originalPrice - discountAmount) * 100) / 100
    };
  }

  // Format file size
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Debounce function
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Remove duplicates from array
  static removeDuplicates(array, key = null) {
    if (key) {
      return array.filter((item, index, self) =>
        index === self.findIndex(t => t[key] === item[key])
      );
    }
    return [...new Set(array)];
  }

  // Generate SEO-friendly meta description
  static generateMetaDescription(text, maxLength = 160) {
    const cleaned = text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    if (cleaned.length <= maxLength) return cleaned;
    
    // Cut at word boundary
    const truncated = cleaned.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    return lastSpace > maxLength * 0.8 
      ? truncated.substring(0, lastSpace) + '...'
      : truncated + '...';
  }

  // Validate image file
  static isValidImageFile(filename) {
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return validExtensions.includes(extension);
  }

  // Generate cache key
  static generateCacheKey(...parts) {
    return parts
      .filter(part => part !== undefined && part !== null)
      .map(part => String(part))
      .join(':');
  }

  // Deep clone object
  static deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Capitalize first letter
  static capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  // Convert string to title case
  static toTitleCase(str) {
    return str.replace(/\w\S*/g, txt => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }

  // Generate random color
  static generateRandomColor() {
    return '#' + Math.floor(Math.random()*16777215).toString(16);
  }

  // Check if string is JSON
  static isJSON(str) {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }
}

module.exports = Helpers;
