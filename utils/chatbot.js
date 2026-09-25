const Product = require('../models/Product');
const Order = require('../models/Order');
const Category = require('../models/Category');

const BRANCHES = [
  { name: 'Belmont', phone: '+263 292 262568', address: 'Belmont, Bulawayo' },
  { name: 'Tongogara', phone: '+263 714 699 928', address: 'Tongogara, Bulawayo' },
  { name: 'Junkshop', phone: '+263 714 699 928', address: 'Junkshop, Bulawayo' },
  { name: 'Maphisa', phone: '+263 715 348 701', address: 'Maphisa' },
  { name: 'Esigodini 2', phone: '+263 718 450 335', address: 'Esigodini' },
  { name: 'Habane', phone: '+263 714 786 731', address: 'Habane' },
  { name: 'Mthwakazi', phone: '+263 714 761 636', address: 'Mthwakazi' },
  { name: 'Mswela', phone: '+263 777 487 698', address: 'Mswela' },
  { name: 'Filabusi Mainshop', phone: '+263 714 761 636', address: 'Filabusi' },
  { name: 'Gwanda VID', phone: '+263 712 290 774', address: 'Gwanda' },
  { name: 'Thobelani', phone: '+263 717 852 371', address: 'Thobelani' },
  { name: 'Gweru MMS', phone: '+263 71 583 0237', address: 'Gweru' },
  { name: 'Gweru EazyTools', phone: '+263 717 12 181', address: 'Gweru' }
];

const INTENTS = {
  GREETING: 'greeting',
  FAREWELL: 'farewell',
  HELP: 'help',
  ORDER_TRACKING: 'order_tracking',
  PRODUCT_SEARCH: 'product_search',
  PRODUCT_DETAIL: 'product_detail',
  PRODUCT_CATEGORY: 'product_category',
  PRODUCT_PRICE: 'product_price',
  PRODUCT_AVAILABILITY: 'product_availability',
  PRODUCT_RECOMMEND: 'product_recommend',
  CATEGORIES: 'categories',
  BRANCHES: 'branches',
  BRANCH_SPECIFIC: 'branch_specific',
  SERVICES: 'services',
  CONTACT: 'contact',
  PRICING: 'pricing',
  DELIVERY: 'delivery',
  PAYMENT: 'payment',
  RETURNS: 'returns',
  ABOUT: 'about',
  COMPARE: 'compare',
  BULK_ORDER: 'bulk_order',
  QUOTE: 'quote',
  UNKNOWN: 'unknown'
};

const GREETING_PATTERNS = /^(hi|hello|hey|howzit|how are you|good (morning|afternoon|evening)|start|menu|greetings)$/i;
const FAREWELL_PATTERNS = /^(bye|goodbye|see you|cheers|thanks|thank you|take care|have a good|ttyl|cya)$/i;
const HELP_PATTERNS = /\b(help|menu|options|commands|what can you do|features|guide)\b/i;
const ORDER_PATTERNS = /(order|track|status|delivery status|where is my|parcel|shipment)/i;
const CATEGORIES_PATTERNS = /(categories?|categor[yi]es|what do you sell|what products|product lines?|departments?|browse|shop by)/i;
const BRANCH_PATTERNS = /(branch|location|store|shop|where|address|near me|directions?|find you|office)/i;
const SERVICE_PATTERNS = /(service|what do you|what can|offer|solution|provide|supply)/i;
const CONTACT_PATTERNS = /(contact|phone|email|call|speak|support|help line|reach you|talk to someone)/i;
const PRICE_PATTERNS = /(price|cost|how much|pricing|rate|cheap|affordable|expensive|budget|quote)/i;
const DELIVERY_PATTERNS = /(deliver|shipping|ship|courier|postage|transport|how long|when will|eta)/i;
const PAYMENT_PATTERNS = /(pay|payment|payment method|bank|cash|card|visa|mastercard|mohewa|ecocash|visa|paynow)/i;
const RETURN_PATTERNS = /(return|refund|exchange|warranty|guarantee|broken|defect|faulty|damaged)/i;
const ABOUT_PATTERNS = /(about|who are|company|history|about mineazy|tell me about|what is mineazy)/i;
const COMPARE_PATTERNS = /(compare|vs|versus|difference|better|which is better|recommend)/i;
const BULK_PATTERNS = /(bulk|wholesale|large order|quantity|volume|corporate|business)/i;
const QUOTE_PATTERNS = /(quote|quotation|request|enquiry|inquiry|rfq)/i;
const PRODUCT_DETAIL_PATTERNS = /(tell me about|details|specifications|specs|features of|description of|info on|more about)/i;
const AVAILABILITY_PATTERNS = /(available|in stock|stock|have.*in|do you have|can i get|any left)/i;
const RECOMMEND_PATTERNS = /(recommend|suggestion|what should|best|top|popular|featured|new|suggest)/i;
const PRODUCT_PATTERNS = /(product|search|catalog|find|look for|looking for|show me|browse|drill|helmet|pump|seal|bearing|bolt|wrench|tool|equipment|machine)/i;

class Chatbot {
  constructor() {
    this.userSessions = new Map();
    this.productCache = null;
    this.categoryCache = null;
    this.cacheTimestamp = null;
    this.CACHE_TTL = 5 * 60 * 1000;
    this.SESSION_TIMEOUT = 30 * 60 * 1000;
  }

  async loadCatalog() {
    const now = Date.now();
    if (this.productCache && this.categoryCache && (now - this.cacheTimestamp) < this.CACHE_TTL) {
      return { products: this.productCache, categories: this.categoryCache };
    }

    try {
      const [products, categories] = await Promise.all([
        Product.find({ isActive: true }),
        Category.find({ isActive: true })
      ]);

      this.productCache = products;
      this.categoryCache = categories;
      this.cacheTimestamp = now;

      console.log(`Ezzie catalog loaded: ${products.length} products, ${categories.length} categories`);
      return { products, categories };
    } catch (error) {
      console.error('Failed to load catalog:', error);
      return { products: this.productCache || [], categories: this.categoryCache || [] };
    }
  }

  getSession(from) {
    if (!this.userSessions.has(from)) {
      this.userSessions.set(from, { state: 'idle', data: {}, lastActive: Date.now() });
    }
    const session = this.userSessions.get(from);
    if (Date.now() - (session.lastActive || 0) > this.SESSION_TIMEOUT) {
      this.userSessions.set(from, { state: 'idle', data: {}, lastActive: Date.now() });
      return this.userSessions.get(from);
    }
    session.lastActive = Date.now();
    return session;
  }

  clearSession(from) {
    this.userSessions.set(from, { state: 'idle', data: {}, lastActive: Date.now() });
  }

  detectIntent(message) {
    const lower = message.toLowerCase().trim();

    if (GREETING_PATTERNS.test(lower)) return INTENTS.GREETING;
    if (FAREWELL_PATTERNS.test(lower)) return INTENTS.FAREWELL;
    if (HELP_PATTERNS.test(lower)) return INTENTS.HELP;
    if (ABOUT_PATTERNS.test(lower)) return INTENTS.ABOUT;
    if (QUOTE_PATTERNS.test(lower)) return INTENTS.QUOTE;
    if (BULK_PATTERNS.test(lower)) return INTENTS.BULK_ORDER;
    if (RETURN_PATTERNS.test(lower)) return INTENTS.RETURNS;
    if (PAYMENT_PATTERNS.test(lower)) return INTENTS.PAYMENT;
    if (DELIVERY_PATTERNS.test(lower)) return INTENTS.DELIVERY;
    if (CONTACT_PATTERNS.test(lower)) return INTENTS.CONTACT;
    if (SERVICE_PATTERNS.test(lower)) return INTENTS.SERVICES;
    if (ORDER_PATTERNS.test(lower)) return INTENTS.ORDER_TRACKING;
    if (CATEGORIES_PATTERNS.test(lower)) return INTENTS.CATEGORIES;
    if (BRANCH_PATTERNS.test(lower)) return INTENTS.BRANCHES;
    if (PRODUCT_DETAIL_PATTERNS.test(lower)) return INTENTS.PRODUCT_DETAIL;
    if (AVAILABILITY_PATTERNS.test(lower)) return INTENTS.PRODUCT_AVAILABILITY;
    if (RECOMMEND_PATTERNS.test(lower)) return INTENTS.PRODUCT_RECOMMEND;
    if (COMPARE_PATTERNS.test(lower)) return INTENTS.COMPARE;
    if (PRICE_PATTERNS.test(lower)) return INTENTS.PRODUCT_PRICE;
    if (PRODUCT_PATTERNS.test(lower)) return INTENTS.PRODUCT_SEARCH;

    if (lower.split(' ').length <= 3 && !lower.includes('?')) {
      return INTENTS.PRODUCT_SEARCH;
    }

    return INTENTS.UNKNOWN;
  }

  extractSearchQuery(message) {
    let cleaned = message
      .replace(/\b(tell me about|details of|specs of|features of|description of|info on|more about|show me|find|search|look for|looking for|do you have|any|the)\b/gi, '')
      .replace(/\b(price|cost|how much|buy|purchase|get|need|want)\b/gi, '')
      .replace(/\?/g, '')
      .trim();

    if (cleaned.length < 2) {
      cleaned = message.replace(/\?/g, '').trim();
    }

    return cleaned;
  }

  async handleMessage(from, body) {
    const session = this.getSession(from);

    if (session.state === 'awaiting_order_id') {
      this.clearSession(from);
      return this.trackOrder(body.trim());
    }

    if (session.state === 'awaiting_product_query') {
      this.clearSession(from);
      return this.searchProducts(body.trim());
    }

    if (session.state === 'awaiting_branch_name') {
      this.clearSession(from);
      return this.getBranchDetail(body.trim());
    }

    if (session.state === 'awaiting_bulk_details') {
      this.clearSession(from);
      return this.handleBulkOrder(body.trim());
    }

    const intent = this.detectIntent(body);

    switch (intent) {
      case INTENTS.GREETING:
        return this.greeting();
      case INTENTS.FAREWELL:
        return this.farewell();
      case INTENTS.HELP:
        return this.help();
      case INTENTS.ABOUT:
        return this.about();
      case INTENTS.ORDER_TRACKING:
        return this.promptOrderTracking(from);
      case INTENTS.PRODUCT_SEARCH:
        const query = this.extractSearchQuery(body);
        return this.searchProducts(query);
      case INTENTS.PRODUCT_DETAIL:
        const detailQuery = this.extractSearchQuery(body);
        return this.getProductDetail(detailQuery);
      case INTENTS.PRODUCT_CATEGORY:
        return this.listCategories();
      case INTENTS.PRODUCT_PRICE:
        const priceQuery = this.extractSearchQuery(body);
        return this.getPriceInfo(priceQuery);
      case INTENTS.PRODUCT_AVAILABILITY:
        const availQuery = this.extractSearchQuery(body);
        return this.checkAvailability(availQuery);
      case INTENTS.PRODUCT_RECOMMEND:
        return this.getRecommendations(body);
      case INTENTS.CATEGORIES:
        return this.listCategories();
      case INTENTS.BRANCHES:
        return this.listBranches();
      case INTENTS.BRANCH_SPECIFIC:
        return this.promptBranchDetail(from);
      case INTENTS.SERVICES:
        return this.listServices();
      case INTENTS.CONTACT:
        return this.contactInfo();
      case INTENTS.PRICING:
        return this.pricingInfo();
      case INTENTS.DELIVERY:
        return this.deliveryInfo();
      case INTENTS.PAYMENT:
        return this.paymentInfo();
      case INTENTS.RETURNS:
        return this.returnsInfo();
      case INTENTS.COMPARE:
        return this.compareProducts(body);
      case INTENTS.BULK_ORDER:
        return this.promptBulkOrder(from);
      case INTENTS.QUOTE:
        return this.quoteRequest();
      default:
        return this.smartSearch(body);
    }
  }

  greeting() {
    const hour = new Date().getHours();
    let timeGreeting = 'Hello';
    if (hour < 12) timeGreeting = 'Good morning';
    else if (hour < 17) timeGreeting = 'Good afternoon';
    else timeGreeting = 'Good evening';

    return `*${timeGreeting}!* I'm *Ezzie*, your Mineazy assistant. 👋

I can help you with:

🔍 *Find Products* — Search our catalog of 2,500+ mining equipment items
📦 *Track Orders* — Check your order status in real-time
🏪 *Branch Locations* — Find any of our 13 branches across Zimbabwe
💰 *Pricing & Quotes* — Get prices and request bulk quotes
🚚 *Delivery Info* — Learn about shipping and delivery
💳 *Payment Options* — See available payment methods

Just type your question or try:
• *"drill"* — search for drills
• *"track order"* — check order status
• *"branches"* — find a branch near you
• *"help"* — see all commands`;
  }

  farewell() {
    return `Thank you for chatting with *Ezzie*! 👋

Have a great day! Remember, I'm always here to help with:
• Product searches
• Order tracking
• Branch locations
• Pricing inquiries

Just type *hi* anytime you need assistance.

*Mineazy — Your Mining Equipment Partner*
🌐 www.mineazy.co.zw`;
  }

  help() {
    return `*Ezzie's Help Menu* 📋

Here's everything I can help you with:

━━━━━━━━━━━━━━━━━━━━━━━━

*🔍 PRODUCT SEARCH*
• Type any product name: *"drill"*, *"helmet"*, *"pump"*
• Ask about a category: *"show me drilling equipment"*
• Check prices: *"how much is a CRANK SHAFT SEAL"*
• Check stock: *"do you have cylinder heads in stock?"*

*📦 ORDER TRACKING*
• Type *"track order"* then enter your order number
• Or type *"track order ORD-20260910-A1B2C3"*

*🏪 LOCATIONS*
• *"branches"* — see all 13 branches
• *"where is your Gweru branch?"* — specific branch info

*💰 PRICING & QUOTES*
• *"price of [product]"* — get pricing
• *"bulk order"* — request wholesale pricing
• *"quote"* — request a formal quotation

*🚚 DELIVERY*
• *"delivery"* — shipping info and timeframes

*💳 PAYMENT*
• *"payment"* — accepted payment methods

*↩️ RETURNS*
• *"returns"* — return and warranty policy

*📞 CONTACT*
• *"contact"* — phone, email, hours

*ℹ️ ABOUT*
• *"about"* — learn about Mineazy

━━━━━━━━━━━━━━━━━━━━━━━━

*Tips:*
• Be specific for better results
• I understand English naturally
• Type *menu* to return here anytime`;
  }

  about() {
    return `*About Mineazy* 🏢

*Mineazy Mining Solutions* is Zimbabwe's leading supplier of mining equipment, tools, and safety gear.

━━━━━━━━━━━━━━━━━━━━━━━━

*📊 At a Glance:*
• 🏪 13 branches across Zimbabwe
• 📦 2,500+ products in catalog
• 🚚 Nationwide delivery
• 💰 Flexible payment options
• 🛡️ Quality guaranteed

*🎯 What We Offer:*
• Mining Equipment & Machinery
• Safety Equipment & PPE
• Engine Parts & Spares
• Drilling Supplies
• Crushing & Processing Equipment
• Welding & Electrical Supplies
• Water Pumps & HDPE Fittings
• Lubricants & Chemicals

*🏭 Industries Served:*
• Mining & Quarrying
• Construction
• Agriculture
• Manufacturing
• Workshop & Maintenance

━━━━━━━━━━━━━━━━━━━━━━━━

*📍 Headquarters:* Bulawayo, Zimbabwe
*📞 Phone:* +263 712 290 046
*📧 Email:* sales@mineazy.co.zw
*🌐 Website:* www.mineazy.co.zw

*💼 Business Hours:*
Monday–Friday: 8:00 AM – 5:00 PM
Saturday: 8:00 AM – 12:00 PM`;
  }

  promptOrderTracking(from) {
    this.userSessions.set(from, { state: 'awaiting_order_id', data: {}, lastActive: Date.now() });
    return `*📦 Order Tracking*

Please provide one of the following:

• *Order number* — e.g., \`ORD-20260910-A1B2C3\`
• *Email address* — the one used to place the order

I'll look up your order status right away!`;
  }

  async trackOrder(input) {
    try {
      let order = null;

      if (/^ORD-/i.test(input)) {
        order = await Order.findOne({ orderNumber: input.toUpperCase() });
      } else if (input.includes('@')) {
        const orders = await Order.find({ 'customerInfo.email': input.toLowerCase() });
        if (orders.length > 0) {
          order = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        }
      }

      if (!order) {
        return `❌ *Order Not Found*

I couldn't find an order matching: \`${input}\`

*Please check:*
• Order number format: \`ORD-YYYYMMDD-XXXXXX\`
• Email address (use the one from your order)

*Need help?*
Type *contact* to reach our support team.`;
      }

      const statusConfig = {
        pending: { emoji: '⏳', color: '🟡', text: 'Pending', desc: 'Your order is being reviewed' },
        processing: { emoji: '🔄', color: '🔵', text: 'Processing', desc: 'We are preparing your order' },
        shipped: { emoji: '🚚', color: '🟣', text: 'Shipped', desc: 'Your order is on the way' },
        delivered: { emoji: '✅', color: '🟢', text: 'Delivered', desc: 'Your order has been delivered' },
        cancelled: { emoji: '❌', color: '🔴', text: 'Cancelled', desc: 'This order has been cancelled' }
      };

      const status = statusConfig[order.status] || { emoji: '📦', color: '⚪', text: order.status, desc: '' };

      let response = `${status.emoji} *ORDER ${order.orderNumber}*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      response += `*Status:* ${status.color} ${status.text}\n`;
      response += `${status.desc}\n\n`;
      response += `*Order Details:*\n`;
      response += `• Date: ${new Date(order.createdAt).toLocaleDateString('en-ZW', { year: 'numeric', month: 'long', day: 'numeric' })}\n`;
      response += `• Total: *$${order.total.toFixed(2)}*\n`;
      response += `• Payment: ${order.paymentMethod.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n\n`;

      response += `*Items:*\n`;
      order.items.forEach((item, i) => {
        response += `${i + 1}. ${item.name}\n   Qty: ${item.quantity} × $${item.price.toFixed(2)} = *$${(item.quantity * item.price).toFixed(2)}*\n`;
      });

      if (order.status === 'shipped' && order.trackingNumber) {
        response += `\n📦 *Tracking Number:* \`${order.trackingNumber}\`\n`;
      }

      if (order.status === 'pending' || order.status === 'processing') {
        response += `\n💡 *What's next?*\n`;
        response += `We'll notify you when your order ships. For urgent inquiries, contact us at +263 712 290 046.`;
      }

      response += `\n\nType *menu* for more options.`;
      return response;
    } catch (error) {
      console.error('Order lookup error:', error);
      return `⚠️ *Error*

Sorry, I encountered an error looking up your order. Please try again or contact support at +263 712 290 046.`;
    }
  }

  async searchProducts(query) {
    try {
      if (!query || query.length < 2) {
        return `🔍 *Product Search*

Please tell me what you're looking for!

*Examples:*
• *"drill"* — search for drills
• *"safety helmet"* — search helmets
• *"CRANK SHAFT SEAL"* — exact product
• *"pumps"* — water pumps

Or type *categories* to browse by category.`;
      }

      const { products, categories } = await this.loadCatalog();
      const categoryMap = {};
      for (const cat of categories) {
        categoryMap[cat._id] = cat.name;
      }

      const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const matches = products.filter(p => {
        return searchRegex.test(p.name) ||
               searchRegex.test(p.description || '') ||
               searchRegex.test(p.sku || '') ||
               (p.tags && p.tags.some(t => searchRegex.test(t)));
      });

      if (matches.length === 0) {
        const categoryNames = categories.map(c => c.name).slice(0, 8);
        return `🔍 *No products found for "${query}"*

*Try:*
• Different keywords
• Check spelling
• Browse by category

*Popular Categories:*
${categoryNames.map(c => `• ${c}`).join('\n')}

Or visit: www.mineazy.co.zw/shop`;
      }

      const sorted = matches.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aExact = aName === query.toLowerCase();
        const bExact = bName === query.toLowerCase();
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        const aStarts = aName.startsWith(query.toLowerCase());
        const bStarts = bName.startsWith(query.toLowerCase());
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return aName.localeCompare(bName);
      });

      const displayProducts = sorted.slice(0, 6);

      let response = `🔍 *Found ${matches.length} product${matches.length !== 1 ? 's' : ''} for "${query}"*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      displayProducts.forEach((product, index) => {
        const categoryName = product.category ? (categoryMap[product.category._id || product.category] || '') : '';
        const effectivePrice = product.salePrice && product.salePrice < product.price ? product.salePrice : product.price;
        const hasDiscount = product.salePrice && product.salePrice < product.price;

        response += `*${index + 1}. ${product.name}*\n`;

        if (hasDiscount) {
          response += `   💰 *$${effectivePrice.toFixed(2)}* ~~$${product.price.toFixed(2)}~~ (${Math.round((1 - product.salePrice / product.price) * 100)}% OFF)\n`;
        } else {
          response += `   💰 *$${effectivePrice.toFixed(2)}*\n`;
        }

        if (categoryName) response += `   📁 ${categoryName}\n`;
        if (product.sku) response += `   🏷️ SKU: \`${product.sku}\`\n`;
        response += `   ${product.inStock ? '✅ In Stock' : '❌ Out of Stock'}\n`;

        if (product.description && product.description !== product.name) {
          const shortDesc = product.description.substring(0, 80);
          response += `   📝 ${shortDesc}${product.description.length > 80 ? '...' : ''}\n`;
        }
        response += `\n`;
      });

      if (matches.length > 6) {
        response += `_...and ${matches.length - 6} more products_\n\n`;
      }

      response += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      response += `🛒 *View all:* www.mineazy.co.zw/shop\n`;
      response += `💬 Type *menu* for more options`;

      return response;
    } catch (error) {
      console.error('Product search error:', error);
      return '⚠️ Sorry, there was an error searching products. Please try again.';
    }
  }

  async getProductDetail(query) {
    try {
      if (!query || query.length < 2) {
        return 'Please provide a product name or SKU to look up.';
      }

      const { products } = await this.loadCatalog();
      const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

      const product = products.find(p =>
        searchRegex.test(p.name) ||
        searchRegex.test(p.sku || '') ||
        (p.slug && searchRegex.test(p.slug))
      );

      if (!product) {
        return `❌ *Product Not Found*

I couldn't find a product matching "${query}".

*Try:*
• Check the product name or SKU
• Use different keywords
• Type *search [query]* to search all products`;
      }

      const { categories } = await this.loadCatalog();
      const categoryName = product.category ? (categories.find(c => c._id === (product.category._id || product.category))?.name || '') : '';
      const effectivePrice = product.salePrice && product.salePrice < product.price ? product.salePrice : product.price;
      const hasDiscount = product.salePrice && product.salePrice < product.price;

      let response = `📦 *${product.name}*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (hasDiscount) {
        response += `💰 *Price:* $${effectivePrice.toFixed(2)} ~~$${product.price.toFixed(2)}~~\n`;
        response += `🔥 *You Save:* $${(product.price - product.salePrice).toFixed(2)} (${Math.round((1 - product.salePrice / product.price) * 100)}% OFF)\n\n`;
      } else {
        response += `💰 *Price:* $${effectivePrice.toFixed(2)}\n\n`;
      }

      response += `*Product Details:*\n`;
      if (categoryName) response += `📁 Category: ${categoryName}\n`;
      if (product.sku) response += `🏷️ SKU: \`${product.sku}\`\n`;
      response += `📦 Stock: ${product.inStock ? '✅ In Stock (' + (product.stockQuantity || 'Available') + ')' : '❌ Out of Stock'}\n`;
      if (product.weight) response += `⚖️ Weight: ${product.weight} kg\n`;

      if (product.specifications && Object.keys(product.specifications).length > 0) {
        response += `\n*Specifications:*\n`;
        for (const [key, value] of Object.entries(product.specifications)) {
          if (value) response += `• ${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}\n`;
        }
      }

      if (product.description && product.description !== product.name) {
        response += `\n*Description:*\n${product.description}\n`;
      }

      response += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      response += `🛒 *Buy now:* www.mineazy.co.zw/product/${product.slug || product._id}\n`;
      response += `💬 Type *menu* for more options`;

      return response;
    } catch (error) {
      console.error('Product detail error:', error);
      return '⚠️ Sorry, there was an error looking up the product.';
    }
  }

  async listCategories() {
    try {
      const { categories, products } = await this.loadCatalog();
      const activeCategories = categories.filter(c => c.isActive).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      let response = `📁 *Product Categories*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      response += `Browse our ${activeCategories.length} categories:\n\n`;

      const productCounts = {};
      for (const product of products) {
        const catId = product.category?._id || product.category;
        if (catId) {
          productCounts[catId] = (productCounts[catId] || 0) + 1;
        }
      }

      activeCategories.forEach((cat, index) => {
        const count = productCounts[cat._id] || 0;
        response += `*${index + 1}. ${cat.name}*\n`;
        if (count > 0) response += `   📦 ${count} product${count !== 1 ? 's' : ''}\n`;
        response += `\n`;
      });

      response += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      response += `💡 *Tip:* Type the category name to search within it!\n\n`;
      response += `Example: *"show me drilling equipment"*\n\n`;
      response += `🛒 *Shop all:* www.mineazy.co.zw/shop\n`;
      response += `💬 Type *menu* for more options`;

      return response;
    } catch (error) {
      console.error('Categories error:', error);
      return '⚠️ Sorry, there was an error loading categories.';
    }
  }

  async checkAvailability(query) {
    try {
      if (!query || query.length < 2) {
        return 'Please specify what product you want to check availability for.';
      }

      const { products } = await this.loadCatalog();
      const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

      const matches = products.filter(p =>
        searchRegex.test(p.name) ||
        searchRegex.test(p.sku || '')
      );

      if (matches.length === 0) {
        return `❌ No products found for "${query}". Try a different search term.`;
      }

      const displayProducts = matches.slice(0, 5);
      let response = `📦 *Stock Check for "${query}"*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      displayProducts.forEach((product, index) => {
        const stockStatus = product.inStock
          ? `✅ In Stock (${product.stockQuantity || 'Available'})`
          : '❌ Out of Stock';
        response += `*${product.name}*\n`;
        response += `   ${stockStatus}\n`;
        response += `   SKU: \`${product.sku || 'N/A'}\`\n\n`;
      });

      response += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      response += `💡 Need a large quantity? Type *bulk order* for special pricing.`;
      return response;
    } catch (error) {
      return '⚠️ Sorry, there was an error checking availability.';
    }
  }

  async getPriceInfo(query) {
    try {
      if (!query || query.length < 2) {
        return 'Please specify what product you want pricing for.';
      }

      const { products } = await this.loadCatalog();
      const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

      const matches = products.filter(p =>
        searchRegex.test(p.name) ||
        searchRegex.test(p.sku || '')
      );

      if (matches.length === 0) {
        return `❌ No products found for "${query}". Try a different search term.`;
      }

      const displayProducts = matches.slice(0, 5);
      let response = `💰 *Pricing for "${query}"*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      displayProducts.forEach((product, index) => {
        const effectivePrice = product.salePrice && product.salePrice < product.price ? product.salePrice : product.price;
        const hasDiscount = product.salePrice && product.salePrice < product.price;

        response += `*${product.name}*\n`;

        if (hasDiscount) {
          response += `   💰 *$${effectivePrice.toFixed(2)}* ~~$${product.price.toFixed(2)}~~\n`;
          response += `   🔥 Save $${(product.price - product.salePrice).toFixed(2)} (${Math.round((1 - product.salePrice / product.price) * 100)}% OFF)\n`;
        } else {
          response += `   💰 *$${effectivePrice.toFixed(2)}*\n`;
        }

        if (product.sku) response += `   SKU: \`${product.sku}\`\n`;
        response += `\n`;
      });

      response += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      response += `💡 *Bulk orders get special pricing!*\n`;
      response += `Type *bulk order* for wholesale rates.\n\n`;
      response += `🛒 *Buy:* www.mineazy.co.zw/shop\n`;
      response += `💬 Type *menu* for more options`;

      return response;
    } catch (error) {
      return '⚠️ Sorry, there was an error getting pricing.';
    }
  }

  async getRecommendations(query) {
    try {
      const { products } = await this.loadCatalog();

      const featured = products.filter(p => p.featured);
      const popular = products.filter(p => (p.viewCount || 0) > 2).sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
      const onSale = products.filter(p => p.salePrice && p.salePrice < p.price);

      let response = `⭐ *Recommended Products*\n`;
      response += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (featured.length > 0) {
        response += `*🔥 Featured Products:*\n\n`;
        featured.slice(0, 3).forEach((product, index) => {
          const effectivePrice = product.salePrice && product.salePrice < product.price ? product.salePrice : product.price;
          response += `*${index + 1}. ${product.name}*\n`;
          response += `   💰 $${effectivePrice.toFixed(2)} | ${product.inStock ? '✅ In Stock' : '❌ Out of Stock'}\n`;
        });
        response += `\n`;
      }

      if (onSale.length > 0) {
        response += `*🏷️ On Sale:*\n\n`;
        onSale.slice(0, 3).forEach((product, index) => {
          const savings = product.price - product.salePrice;
          const percent = Math.round((savings / product.price) * 100);
          response += `*${index + 1}. ${product.name}*\n`;
          response += `   💰 *$${product.salePrice.toFixed(2)}* ~~$${product.price.toFixed(2)}~~ (${percent}% OFF)\n`;
        });
        response += `\n`;
      }

      if (popular.length > 0) {
        response += `*📈 Popular Items:*\n\n`;
        popular.slice(0, 3).forEach((product, index) => {
          const effectivePrice = product.salePrice && product.salePrice < product.price ? product.salePrice : product.price;
          response += `*${index + 1}. ${product.name}*\n`;
          response += `   💰 $${effectivePrice.toFixed(2)} | 👁️ ${product.viewCount || 0} views\n`;
        });
        response += `\n`;
      }

      response += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      response += `🛒 *Shop all:* www.mineazy.co.zw/shop\n`;
      response += `💬 Type *menu* for more options`;

      return response;
    } catch (error) {
      return '⚠️ Sorry, there was an error loading recommendations.';
    }
  }

  listBranches() {
    let response = `🏪 *Our Branches Across Zimbabwe*\n`;
    response += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const regions = {
      'Bulawayo': BRANCHES.filter(b => ['Belmont', 'Tongogara', 'Junkshop'].includes(b.name)),
      'Matebeland': BRANCHES.filter(b => ['Maphisa', 'Esigodini 2', 'Habane'].includes(b.name)),
      'Matabeleland South': BRANCHES.filter(b => ['Mthwakazi', 'Mswela', 'Filabusi Mainshop'].includes(b.name)),
      'Gwanda': BRANCHES.filter(b => ['Gwanda VID', 'Thobelani'].includes(b.name)),
      'Gweru': BRANCHES.filter(b => ['Gweru MMS', 'Gweru EazyTools'].includes(b.name))
    };

    for (const [region, branches] of Object.entries(regions)) {
      if (branches.length > 0) {
        response += `*📍 ${region}:*\n\n`;
        branches.forEach(branch => {
          response += `*${branch.name}*\n`;
          response += `   📞 ${branch.phone}\n`;
          response += `   📍 ${branch.address}\n\n`;
        });
      }
    }

    response += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    response += `🗺️ *Interactive Map:* www.mineazy.co.zw/#branch-locator\n\n`;
    response += `💡 *Need a specific branch?*\n`;
    response += `Type: *"Where is your [branch name] branch?"*\n\n`;
    response += `💬 Type *menu* for more options`;

    return response;
  }

  promptBranchDetail(from) {
    this.userSessions.set(from, { state: 'awaiting_branch_name', data: {}, lastActive: Date.now() });
    return `Which branch are you looking for?

Type the branch name (e.g., *"Gweru MMS"* or *"Filabusi"*)`;
  }

  async getBranchDetail(input) {
    const branch = BRANCHES.find(b =>
      b.name.toLowerCase().includes(input.toLowerCase()) ||
      input.toLowerCase().includes(b.name.toLowerCase())
    );

    if (!branch) {
      return `❌ Branch not found for "${input}".

*Available branches:*
${BRANCHES.map(b => `• ${b.name}`).join('\n')}

Type *branches* to see all locations with phone numbers.`;
    }

    let response = `🏪 *${branch.name}*\n`;
    response += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    response += `📞 *Phone:* ${branch.phone}\n`;
    response += `📍 *Address:* ${branch.address}\n\n`;
    response += `🕐 *Hours:*\n`;
    response += `   Mon–Fri: 8:00 AM – 5:00 PM\n`;
    response += `   Saturday: 8:00 AM – 12:00 PM\n\n`;
    response += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    response += `🗺️ *Get Directions:* www.mineazy.co.zw/#branch-locator\n`;
    response += `💬 Type *menu* for more options`;

    return response;
  }

  listServices() {
    return `*Our Services* 🛠️
━━━━━━━━━━━━━━━━━━━━━━━━

*🔧 Mining Equipment Sales*
Wide range of drilling, excavation, and processing equipment from trusted brands.

*🛡️ Safety Equipment & PPE*
Helmets, gloves, boots, goggles, ear protection, hi-vis clothing, and more.

*📦 Parts & Spares*
Genuine replacement parts for engines, compressors, and mining machinery.

*🚚 Nationwide Delivery*
We deliver to all corners of Zimbabwe. Free delivery on qualifying orders.

*💰 Credit Facilities*
Flexible payment terms for qualified businesses and regular customers.

*📞 Technical Support*
Expert advice on equipment selection, maintenance, and troubleshooting.

*🏭 Workshop Services*
Equipment servicing, repairs, and refurbishment.

━━━━━━━━━━━━━━━━━━━━━━━━

*Industries We Serve:*
• Mining & Quarrying
• Construction
• Agriculture
• Manufacturing

*Need a custom solution?*
📞 Call us: +263 712 290 046
📧 Email: sales@mineazy.co.zw

💬 Type *menu* for more options`;
  }

  contactInfo() {
    return `*Contact Mineazy* 📞
━━━━━━━━━━━━━━━━━━━━━━━━

*📱 Phone:*
• Main: +263 712 290 046
• WhatsApp: +263 712 290 046

*📧 Email:*
• Sales: sales@mineazy.co.zw
• Support: support@mineazy.co.zw

*🌐 Website:*
www.mineazy.co.zw

*💼 Business Hours:*
• Monday–Friday: 8:00 AM – 5:00 PM
• Saturday: 8:00 AM – 12:00 PM
• Sunday: Closed

*📍 Headquarters:*
Bulawayo, Zimbabwe

━━━━━━━━━━━━━━━━━━━━━━━━

*💬 Quick Contact:*
• Type *"branches"* for branch phone numbers
• Type *"quote"* to request a quotation

💬 Type *menu* for more options`;
  }

  pricingInfo() {
    return `*Pricing Information* 💰
━━━━━━━━━━━━━━━━━━━━━━━━

*How to Get Pricing:*

*1. Search by Product Name*
Type: *"price of [product name]"*
Example: *"price of CRANK SHAFT SEAL"*

*2. Search by Category*
Type: *"show me [category]"*
Example: *"show me drilling equipment"*

*3. Bulk Orders*
Type: *"bulk order"* for wholesale pricing

*4. Request a Quote*
Type: *"quote"* for a formal quotation

━━━━━━━━━━━━━━━━━━━━━━━━

*Payment Methods:*
• 💳 Paynow (Cards, Mobile Money)
• 💵 Cash on Delivery
• 🏦 Bank Transfer
• 💰 Cash on Collection

*Note:* All prices are in USD.
Prices may vary. Contact us for latest pricing.

💬 Type *menu* for more options`;
  }

  deliveryInfo() {
    return `*Delivery Information* 🚚
━━━━━━━━━━━━━━━━━━━━━━━━

*📦 Delivery Coverage:*
We deliver to ALL locations in Zimbabwe!

*🚚 Delivery Options:*

*1. Standard Delivery*
• Time: 3–5 business days
• Cost: Free on orders over $100
• $5 flat rate for smaller orders

*2. Express Delivery*
• Time: 1–2 business days
• Cost: $15 flat rate
• Available for Bulawayo & Harare

*3. Collection*
• FREE collection from any of our 13 branches
• Ready within 24 hours of order

*📋 How It Works:*
1. Place your order online or via phone
2. Choose delivery or collection
3. Receive confirmation with estimated time
4. Track your order via Ezzie!

━━━━━━━━━━━━━━━━━━━━━━━━

*Need to track your order?*
Type *"track order"* followed by your order number.

*Questions about delivery?*
📞 Call: +263 712 290 046

💬 Type *menu* for more options`;
  }

  paymentInfo() {
    return `*Payment Methods* 💳
━━━━━━━━━━━━━━━━━━━━━━━━

*We Accept:*

*1. 💳 Paynow*
• Visa & Mastercard
• EcoCash
• OneMoney
• Telecash
• InnBucks
• Zimswitch

*2. 💵 Cash on Delivery (COD)*
• Pay when you receive your order
• Available for all delivery areas

*3. 🏦 Bank Transfer*
• Direct bank deposit
• Transfer confirmation required
• Order ships after payment verified

*4. 💰 Cash on Collection*
• Pay at any of our 13 branches
• Collect your order immediately

━━━━━━━━━━━━━━━━━━━━━━━━

*🔒 Secure Payments:*
All online payments are encrypted and secure.

*💳 Pay Online:*
www.mineazy.co.zw/checkout

*Questions about payment?*
📞 Call: +263 712 290 046

💬 Type *menu* for more options`;
  }

  returnsInfo() {
    return `*Returns & Warranty Policy* ↩️
━━━━━━━━━━━━━━━━━━━━━━━━

*🔄 Returns:*

*Eligibility:*
• Return within 14 days of purchase
• Item must be unused and in original packaging
• Proof of purchase required

*Non-Returnable Items:*
• Custom orders
• Clearance items
• Used/worn safety equipment

*🔄 How to Return:*
1. Contact us at +263 712 290 046
2. Get a Return Authorization Number
3. Ship or bring item to any branch
4. Refund processed within 5–7 days

━━━━━━━━━━━━━━━━━━━━━━━━

*🛡️ Warranty:*

• All products carry manufacturer warranty
• Warranty period varies by product
• Keep your receipt for warranty claims

*Warranty Covers:*
• Manufacturing defects
• Faulty materials
• Premature failure under normal use

*Warranty Does NOT Cover:*
• Damage from misuse
• Normal wear and tear
• Unauthorized modifications

━━━━━━━━━━━━━━━━━━━━━━━━

*Need to start a return?*
📞 Call: +263 712 290 046
📧 Email: returns@mineazy.co.zw

💬 Type *menu* for more options`;
  }

  async compareProducts(message) {
    const { products } = await this.loadCatalog();
    const query = this.extractSearchQuery(message);

    if (!query) {
      return `🔍 *Product Comparison*

Tell me what products to compare!

*Example:*
• *"compare pumps"*
• *"difference between Model A and Model B"*

I'll show you the details side by side.`;
    }

    const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matches = products.filter(p => searchRegex.test(p.name)).slice(0, 3);

    if (matches.length < 2) {
      return `I need at least 2 products to compare. I found ${matches.length} for "${query}".

Try a broader search term.`;
    }

    let response = `📊 *Product Comparison*\n`;
    response += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    matches.forEach((product, index) => {
      const effectivePrice = product.salePrice && product.salePrice < product.price ? product.salePrice : product.price;
      response += `*${index + 1}. ${product.name}*\n`;
      response += `   💰 $${effectivePrice.toFixed(2)}\n`;
      response += `   📦 ${product.inStock ? 'In Stock' : 'Out of Stock'}\n`;
      if (product.sku) response += `   🏷️ SKU: ${product.sku}\n`;
      response += `\n`;
    });

    response += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    response += `💬 Type *menu* for more options`;

    return response;
  }

  promptBulkOrder(from) {
    this.userSessions.set(from, { state: 'awaiting_bulk_details', data: {}, lastActive: Date.now() });
    return `*📦 Bulk Order Request*

I'd be happy to help with bulk pricing!

Please provide:
1. *Product name(s)* you're interested in
2. *Quantity* needed
3. *Delivery location*

Or call our sales team directly:
📞 +263 712 290 046
📧 sales@mineazy.co.zw

*Bulk Benefits:*
• Volume discounts
• Priority delivery
• Dedicated account manager
• Flexible payment terms`;
  }

  async handleBulkOrder(input) {
    this.clearSession(input);
    return `*✅ Bulk Order Request Received*

Thank you for your interest in bulk purchasing!

Our sales team will contact you within 24 hours with a custom quote.

*In the meantime:*
📞 Call: +263 712 290 046
📧 Email: sales@mineazy.co.zw

*Your message:*
"${input}"

━━━━━━━━━━━━━━━━━━━━━━━━

*Bulk Order Benefits:*
• 💰 Volume discounts (up to 20% off)
• 🚚 Free delivery on large orders
• 💳 Flexible payment terms
• 📞 Dedicated account manager

💬 Type *menu* for more options`;
  }

  quoteRequest() {
    return `*📝 Request a Quotation*
━━━━━━━━━━━━━━━━━━━━━━━━

*How to Get a Quote:*

*Option 1: Online*
Visit: www.mineazy.co.zw/quote

*Option 2: Email*
📧 Send details to: sales@mineazy.co.zw
Include: Product names, quantities, delivery location

*Option 3: Phone*
📞 Call: +263 712 290 046

━━━━━━━━━━━━━━━━━━━━━━━━

*What to Include:*
• Product names or SKUs
• Quantities needed
• Delivery address
• Any special requirements

*Quote Validity:*
• Quotes valid for 7 days
• Subject to stock availability

━━━━━━━━━━━━━━━━━━━━━━━━

*Ready to order now?*
Visit: www.mineazy.co.zw/shop

💬 Type *menu* for more options`;
  }

  async smartSearch(message) {
    try {
      const { products, categories } = await this.loadCatalog();
      const lower = message.toLowerCase();

      const categoryMatch = categories.find(c =>
        lower.includes(c.name.toLowerCase()) ||
        c.name.toLowerCase().includes(lower)
      );

      if (categoryMatch) {
        const categoryProducts = products.filter(p => {
          const catId = p.category?._id || p.category;
          return catId === categoryMatch._id;
        });

        if (categoryProducts.length > 0) {
          let response = `📁 *${categoryMatch.name}*\n`;
          response += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
          response += `Found *${categoryProducts.length}* product${categoryProducts.length !== 1 ? 's' : ''} in this category:\n\n`;

          categoryProducts.slice(0, 6).forEach((product, index) => {
            const effectivePrice = product.salePrice && product.salePrice < product.price ? product.salePrice : product.price;
            response += `*${index + 1}. ${product.name}*\n`;
            response += `   💰 $${effectivePrice.toFixed(2)} | ${product.inStock ? '✅' : '❌'}\n`;
          });

          if (categoryProducts.length > 6) {
            response += `\n_...and ${categoryProducts.length - 6} more_\n`;
          }

          response += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          response += `🛒 *Shop:* www.mineazy.co.zw/shop\n`;
          response += `💬 Type *menu* for more options`;
          return response;
        }
      }

      const searchRegex = new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const directMatch = products.find(p => searchRegex.test(p.name));

      if (directMatch) {
        return this.getProductDetail(directMatch.name);
      }

      const wordMatches = products.filter(p => {
        const words = message.toLowerCase().split(/\s+/);
        return words.some(word => word.length > 2 && searchRegex.test(p.name));
      }).slice(0, 5);

      if (wordMatches.length > 0) {
        let response = `🔍 *Related Products*\n`;
        response += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        wordMatches.forEach((product, index) => {
          const effectivePrice = product.salePrice && product.salePrice < product.price ? product.salePrice : product.price;
          response += `*${index + 1}. ${product.name}*\n`;
          response += `   💰 $${effectivePrice.toFixed(2)} | ${product.inStock ? '✅ In Stock' : '❌ Out of Stock'}\n`;
        });

        response += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        response += `💡 *Can't find what you need?*\n`;
        response += `Try being more specific or type *categories* to browse.\n\n`;
        response += `💬 Type *menu* for more options`;
        return response;
      }

      return `🤔 *I'm not sure I understand*

I can help you with:
• *Product searches* — type a product name
• *Order tracking* — type "track order"
• *Branch locations* — type "branches"
• *Pricing* — type "price of [product]"
• *Delivery info* — type "delivery"
• *Payment methods* — type "payment"

Or type *help* to see all commands.

*Mineazy — Your Mining Equipment Partner*
🌐 www.mineazy.co.zw`;
    } catch (error) {
      console.error('Smart search error:', error);
      return '⚠️ Sorry, I encountered an error. Please try again or type *help* for assistance.';
    }
  }
}

module.exports = new Chatbot();
