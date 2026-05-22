// User roles and permissions
const USER_ROLES = {
  GUEST: 'guest',
  CUSTOMER: 'customer',
  BUSINESS: 'business',
  SALES_REP: 'sales_rep',
  CONTENT_MANAGER: 'content_manager',
  INVENTORY_MANAGER: 'inventory_manager',
  ORDER_MANAGER: 'order_manager',
  SUPER_ADMIN: 'super_admin'
};

// Role permissions mapping
const ROLE_PERMISSIONS = {
  [USER_ROLES.GUEST]: [
    'browse_products',
    'view_product',
    'add_to_cart',
    'checkout_guest'
  ],
  [USER_ROLES.CUSTOMER]: [
    'browse_products',
    'view_product',
    'add_to_cart',
    'checkout',
    'view_orders',
    'request_quote',
    'update_profile'
  ],
  [USER_ROLES.BUSINESS]: [
    'browse_products',
    'view_product',
    'add_to_cart',
    'checkout',
    'view_orders',
    'request_quote',
    'bulk_orders',
    'view_quotes',
    'update_profile'
  ],
  [USER_ROLES.SALES_REP]: [
    'manage_quotes',
    'view_customers',
    'contact_customers'
  ],
  [USER_ROLES.CONTENT_MANAGER]: [
    'manage_blog',
    'manage_pages',
    'manage_contact_messages',
    'send_newsletters'
  ],
  [USER_ROLES.INVENTORY_MANAGER]: [
    'manage_products',
    'manage_categories',
    'view_inventory',
    'bulk_import'
  ],
  [USER_ROLES.ORDER_MANAGER]: [
    'manage_orders',
    'manage_payments',
    'send_invoices',
    'update_shipping'
  ],
  [USER_ROLES.SUPER_ADMIN]: [
    'all_permissions'
  ]
};

// Order statuses
const ORDER_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
};

// Payment statuses
const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  AWAITING_PAYMENT: 'awaiting_payment',
  PAYMENT_ON_DELIVERY: 'payment_on_delivery',
  PAYMENT_ON_COLLECTION: 'payment_on_collection'
};

// Payment methods
const PAYMENT_METHODS = {
  PAYNOW: 'paynow',
  CASH_ON_DELIVERY: 'cash_on_delivery',
  COLLECTION: 'collection'
};

// Quote statuses
const QUOTE_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

// Blog post statuses
const BLOG_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published'
};

// Contact message statuses
const CONTACT_STATUS = {
  NEW: 'new',
  READ: 'read',
  REPLIED: 'replied',
  CLOSED: 'closed'
};

// File upload limits
const FILE_LIMITS = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_FILES_PER_UPLOAD: 10,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['text/csv', 'application/pdf', 'application/msword'],
  IMAGE_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  DOCUMENT_EXTENSIONS: ['.csv', '.pdf', '.doc', '.docx']
};

// Pagination defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  DEFAULT_SORT: 'createdAt',
  DEFAULT_ORDER: 'desc'
};

// Cache durations (in seconds)
const CACHE_DURATION = {
  SHORT: 300,      // 5 minutes
  MEDIUM: 1800,    // 30 minutes
  LONG: 3600,      // 1 hour
  VERY_LONG: 86400 // 24 hours
};

// Email templates
const EMAIL_TEMPLATES = {
  ORDER_CONFIRMATION: 'order_confirmation',
  ORDER_SHIPPED: 'order_shipped',
  ORDER_DELIVERED: 'order_delivered',
  INVOICE: 'invoice',
  PASSWORD_RESET: 'password_reset',
  EMAIL_VERIFICATION: 'email_verification',
  WELCOME: 'welcome',
  NEWSLETTER: 'newsletter'
};

// Tax rates by location
const TAX_RATES = {
  ZIMBABWE: 0.155,   // 15.5% VAT
  DEFAULT: 0.10      // 10% default
};

// Shipping methods
const SHIPPING_METHODS = {
  STANDARD: 'standard',
  EXPRESS: 'express',
  OVERNIGHT: 'overnight',
  COLLECTION: 'collection',
  INTERNATIONAL: 'international'
};

// Product sort options
const PRODUCT_SORT_OPTIONS = {
  NEWEST: 'createdAt',
  OLDEST: '-createdAt',
  PRICE_LOW_HIGH: 'price',
  PRICE_HIGH_LOW: '-price',
  NAME_A_Z: 'name',
  NAME_Z_A: '-name',
  FEATURED: 'featured',
  POPULARITY: 'viewCount'
};

// Search filters
const SEARCH_FILTERS = {
  CATEGORIES: 'categories',
  PRICE_RANGE: 'priceRange',
  IN_STOCK: 'inStock',
  FEATURED: 'featured',
  TAGS: 'tags',
  SPECIFICATIONS: 'specifications'
};

// API response messages
const MESSAGES = {
  SUCCESS: {
    CREATED: 'Resource created successfully',
    UPDATED: 'Resource updated successfully',
    DELETED: 'Resource deleted successfully',
    FOUND: 'Resource found',
    LOGIN: 'Login successful',
    LOGOUT: 'Logout successful',
    EMAIL_SENT: 'Email sent successfully'
  },
  ERROR: {
    NOT_FOUND: 'Resource not found',
    UNAUTHORIZED: 'Unauthorized access',
    FORBIDDEN: 'Access forbidden',
    VALIDATION_FAILED: 'Validation failed',
    SERVER_ERROR: 'Internal server error',
    INVALID_CREDENTIALS: 'Invalid credentials',
    DUPLICATE_ENTRY: 'Resource already exists',
    INSUFFICIENT_STOCK: 'Insufficient stock available'
  }
};

// Regex patterns
const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s\-\(\)]{10,}$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/,
  SKU: /^[A-Z0-9\-]{3,20}$/,
  SLUG: /^[a-z0-9\-]+$/,
  HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
};

// Countries and currencies
const COUNTRIES = {
  ZIMBABWE: { code: 'ZW', name: 'Zimbabwe', currency: 'USD' },
  SOUTH_AFRICA: { code: 'ZA', name: 'South Africa', currency: 'ZAR' },
  BOTSWANA: { code: 'BW', name: 'Botswana', currency: 'BWP' },
  ZAMBIA: { code: 'ZM', name: 'Zambia', currency: 'ZMW' }
};

// System settings defaults
const SYSTEM_DEFAULTS = {
  CURRENCY: 'USD',
  TIMEZONE: 'Africa/Harare',
  LANGUAGE: 'en',
  ITEMS_PER_PAGE: 12,
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  PASSWORD_RESET_EXPIRY: 10 * 60 * 1000, // 10 minutes
  EMAIL_VERIFICATION_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
  QUOTE_VALIDITY: 30 * 24 * 60 * 60 * 1000 // 30 days
};

// HTTP status codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// Event types for logging
const EVENT_TYPES = {
  USER_REGISTERED: 'user_registered',
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  ORDER_CREATED: 'order_created',
  ORDER_UPDATED: 'order_updated',
  PAYMENT_PROCESSED: 'payment_processed',
  PRODUCT_CREATED: 'product_created',
  PRODUCT_UPDATED: 'product_updated',
  EMAIL_SENT: 'email_sent',
  ERROR_OCCURRED: 'error_occurred'
};

// Environment types
const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  TEST: 'test',
  STAGING: 'staging',
  PRODUCTION: 'production'
};

module.exports = {
  USER_ROLES,
  ROLE_PERMISSIONS,
  ORDER_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHODS,
  QUOTE_STATUS,
  BLOG_STATUS,
  CONTACT_STATUS,
  FILE_LIMITS,
  PAGINATION,
  CACHE_DURATION,
  EMAIL_TEMPLATES,
  TAX_RATES,
  SHIPPING_METHODS,
  PRODUCT_SORT_OPTIONS,
  SEARCH_FILTERS,
  MESSAGES,
  REGEX_PATTERNS,
  COUNTRIES,
  SYSTEM_DEFAULTS,
  HTTP_STATUS,
  EVENT_TYPES,
  ENVIRONMENTS
};
