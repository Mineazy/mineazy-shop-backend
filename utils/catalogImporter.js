const slugify = require('slugify');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { isValidImageUrl } = require('./productImageUtils');

const SUPPORTED_FORMATS = ['mineazy-catalog-v1'];

class CatalogImporter {
  constructor() {
    this.results = null;
  }

  _resetResults() {
    this.results = {
      success: false,
      format: null,
      categories: { created: 0, updated: 0, skipped: 0, errors: [] },
      products: { created: 0, updated: 0, skipped: 0, errors: [] }
    };
  }

  /**
   * Validate the raw catalog payload structure.
   */
  validatePayload(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Catalog payload must be a JSON object');
    }
    if (!SUPPORTED_FORMATS.includes(data.format)) {
      throw new Error(`Unsupported catalog format "${data.format}". Supported: ${SUPPORTED_FORMATS.join(', ')}`);
    }
    if (!Array.isArray(data.categories)) {
      throw new Error('Catalog is missing "categories" array');
    }
    if (!Array.isArray(data.products)) {
      throw new Error('Catalog is missing "products" array');
    }
  }

  _normalizeCategory(raw) {
    const cat = {
      name: String(raw.name || '').trim(),
      slug: raw.slug ? String(raw.slug).trim() : slugify(String(raw.name || ''), { lower: true }),
      description: raw.description || '',
      isActive: raw.isActive !== false,
      sortOrder: Number(raw.sortOrder) || 0,
      parent: raw.parent || null
    };
    if (raw._id) cat._id = String(raw._id);
    if (raw.metaTitle) cat.metaTitle = String(raw.metaTitle);
    if (raw.metaDescription) cat.metaDescription = String(raw.metaDescription);
    if (raw.metaKeywords) cat.metaKeywords = String(raw.metaKeywords);
    // Preserve original timestamps so storefront sort order is unchanged
    if (raw.createdAt) cat.createdAt = String(raw.createdAt);
    if (raw.updatedAt) cat.updatedAt = String(raw.updatedAt);
    return cat;
  }

  _normalizeProduct(raw, categoryIdBySlug) {
    const product = {
      name: String(raw.name || '').trim(),
      description: raw.description || '',
      shortDescription: raw.shortDescription || '',
      sku: raw.sku ? String(raw.sku).trim().toUpperCase() : '',
      price: Number(raw.price) || 0,
      salePrice: raw.salePrice !== undefined && raw.salePrice !== null ? Number(raw.salePrice) : null,
      category: null,
      inStock: raw.inStock !== false,
      stockQuantity: Number(raw.stockQuantity) || 0,
      isActive: raw.isActive !== false,
      featured: !!raw.featured,
      viewCount: Number(raw.viewCount) || 0,
      weight: raw.weight !== undefined && raw.weight !== null ? Number(raw.weight) : null,
      dimensions: raw.dimensions && typeof raw.dimensions === 'object' ? raw.dimensions : undefined,
      specifications: raw.specifications && typeof raw.specifications === 'object' ? raw.specifications : {},
      tags: Array.isArray(raw.tags) ? raw.tags.map(t => String(t).trim()).filter(Boolean) : [],
      images: Array.isArray(raw.images) ? raw.images.filter(img => typeof img === 'string').map(img => img.trim()).filter(Boolean) : []
    };

    if (raw._id) product._id = String(raw._id);
    if (raw.slug) product.slug = String(raw.slug).trim();
    else if (product.name) product.slug = slugify(product.name, { lower: true });

    // Resolve category: raw.category may be an embedded object ({ _id, name, slug })
    // or a plain category id string. Convert to a category _id.
    const cat = raw.category;
    if (cat && typeof cat === 'object') {
      product.category = cat._id
        ? String(cat._id)
        : (cat.slug ? categoryIdBySlug.get(cat.slug) : null) || null;
    } else if (typeof cat === 'string' && cat.trim()) {
      product.category = cat.trim();
    }

    // Keep only valid image URLs; drop anything clearly invalid
    product.images = product.images.filter(img => isValidImageUrl(img) || img.startsWith('/uploads/') || img.startsWith('data:image/'));

    // Preserve original timestamps so storefront sort order is unchanged
    if (raw.createdAt) product.createdAt = String(raw.createdAt);
    if (raw.updatedAt) product.updatedAt = String(raw.updatedAt);

    return product;
  }

  /**
   * Import/update a full catalog (categories + products).
   *
   * @param {object} data - raw catalog payload (mineazy-catalog-v1)
   * @param {object} options
   * @param {'upsert'|'create_only'|'update_only'} [options.mode='upsert']
   * @param {boolean} [options.dryRun=false] - report only, no writes
   * @param {string[]} [options.productsToSkip] - SKUs to never touch
   */
  async importCatalog(data, options = {}) {
    const mode = options.mode || 'upsert';
    const dryRun = !!options.dryRun;
    const skipSkus = new Set(options.productsToSkip || []);
    this._resetResults();
    this.validatePayload(data);

    this.results.format = data.format;

    // Build a slug -> category _id map so embedded category objects without _id
    // can still be resolved (the catalog embeds full category objects).
    const categoryIdBySlug = new Map();
    for (const rawCat of data.categories) {
      const normalized = this._normalizeCategory(rawCat);
      if (normalized.slug) categoryIdBySlug.set(normalized.slug.toLowerCase(), normalized._id || null);
      if (rawCat.name) categoryIdBySlug.set(slugify(String(rawCat.name), { lower: true }), normalized._id || null);
    }

    const categories = data.categories.map(raw => this._normalizeCategory(raw));
    const products = data.products.map(raw => this._normalizeProduct(raw, categoryIdBySlug));

    // ---- Categories ----
    for (const cat of categories) {
      try {
        await this._upsertCategory(cat, mode, dryRun);
      } catch (error) {
        this.results.categories.errors.push({
          name: cat.name,
          slug: cat.slug,
          error: error.message
        });
      }
    }

    // ---- Products ----
    for (const product of products) {
      try {
        if (skipSkus.has(product.sku)) {
          this.results.products.skipped++;
          continue;
        }
        await this._upsertProduct(product, mode, dryRun);
      } catch (error) {
        this.results.products.errors.push({
          sku: product.sku,
          name: product.name,
          error: error.message
        });
      }
    }

    this.results.success = true;
    return this.results;
  }

  async _upsertCategory(cat, mode, dryRun) {
    // Existing by _id first, then by slug
    let existing = null;
    if (cat._id) existing = await Category.findOne({ _id: cat._id });
    if (!existing && cat.slug) existing = await Category.findOne({ slug: cat.slug });

    if (existing) {
      if (mode === 'create_only') {
        this.results.categories.skipped++;
        return;
      }
      if (!dryRun) {
        const merged = { ...existing, ...cat };
        delete merged._id;
        await Category.db.update({ _id: existing._id }, merged);
      }
      this.results.categories.updated++;
    } else {
      if (mode === 'update_only') {
        this.results.categories.skipped++;
        return;
      }
      if (!dryRun) {
        await Category.db.insert(cat);
      }
      this.results.categories.created++;
    }
  }

  async _upsertProduct(product, mode, dryRun) {
    // Existing by _id first, then by sku
    let existing = null;
    if (product._id) existing = await Product.findOne({ _id: product._id });
    if (!existing && product.sku) existing = await Product.findOne({ sku: product.sku });

    if (existing) {
      if (mode === 'create_only') {
        this.results.products.skipped++;
        return;
      }
      if (!dryRun) {
        // Keep live viewCount (usage data) and timestamps; apply catalog data over the rest
        const merged = { ...existing, ...product };
        delete merged._id;
        merged.viewCount = existing.viewCount || 0;
        if (existing.createdAt && !product.createdAt) merged.createdAt = existing.createdAt;
        await Product.db.update({ _id: existing._id }, merged);
      }
      this.results.products.updated++;
    } else {
      if (mode === 'update_only') {
        this.results.products.skipped++;
        return;
      }
      if (!dryRun) {
        await Product.db.insert(product);
      }
      this.results.products.created++;
    }
  }
}

module.exports = new CatalogImporter();
