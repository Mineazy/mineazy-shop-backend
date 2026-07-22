const csv = require('csv-parser');
const fs = require('fs');
const xss = require('xss');
const Product = require('../models/Product');
const Category = require('../models/Category');
const slugify = require('slugify');
const { isValidImageUrl } = require('./productImageUtils');

class CSVImporter {
  constructor() {
    this.results = null;
  }

  _resetResults() {
    this.results = {
      success: false,
      imported: 0,
      updated: 0,
      errors: [],
      skipped: []
    };
  }

  /**
   * Import or update products from CSV
   * @param {string} filePath - Path to CSV file
   * @param {boolean} updateExisting - Whether to update existing products (default: true)
   * @param {array} fieldsToUpdate - Specific fields to update (if empty, updates all provided fields)
   * @param {object} options - { concurrency: 5, errorThreshold: 0 }
   */
  async importProducts(filePath, updateExisting = true, fieldsToUpdate = [], options = {}) {
    const { concurrency = 5, errorThreshold = 0 } = options;
    this._resetResults();

    return new Promise((resolve, reject) => {
      const products = [];
      let rowNumber = 1;

      fs.createReadStream(filePath)
        .pipe(csv({
          mapHeaders: ({ header }) => header.trim().toLowerCase()
        }))
        .on('data', (row) => {
          rowNumber++;
          try {
            const productData = this.validateAndProcessRow(row, rowNumber, fieldsToUpdate);
            if (productData) {
              products.push(productData);
            }
          } catch (error) {
            this.results.errors.push({
              row: rowNumber,
              error: error.message
            });
          }
        })
        .on('end', async () => {
          try {
            if (errorThreshold > 0 &&
                this.results.errors.length > 0 &&
                this.results.errors.length > products.length * errorThreshold) {
              this.results.success = false;
              return resolve(this.results);
            }

            await this._processProductsBatched(products, updateExisting, fieldsToUpdate, concurrency);
            this.results.success = true;
            resolve(this.results);
          } catch (error) {
            this.results.errors.push({
              row: 'batch_processing',
              error: error.message
            });
            this.results.success = false;
            resolve(this.results);
          }
        })
        .on('error', (error) => {
          this.results.errors.push({
            row: 'file_reading',
            error: error.message
          });
          this.results.success = false;
          resolve(this.results);
        });
    });
  }

  validateAndProcessRow(row, rowNumber, fieldsToUpdate = []) {
    if (!row.sku || row.sku.toString().trim() === '') {
      throw new Error('SKU is required to identify products');
    }

    const sku = row.sku.toString().trim().toUpperCase();
    if (sku.length < 3 || sku.length > 20) {
      throw new Error('SKU must be between 3 and 20 characters');
    }

    const productData = {
      sku: sku,
      rowNumber: rowNumber,
      providedFields: []
    };

    const shouldProcess = (fieldName) => {
      return fieldsToUpdate.length === 0 || fieldsToUpdate.includes(fieldName);
    };

    if (row.name && row.name.trim() !== '') {
      if (shouldProcess('name')) {
        productData.name = xss(row.name.trim());
        productData.providedFields.push('name');
      }
    }

    if (row.description && shouldProcess('description')) {
      productData.description = xss(row.description.trim());
      productData.providedFields.push('description');
    }

    if (row.shortdescription && shouldProcess('shortDescription')) {
      productData.shortDescription = xss(row.shortdescription.trim());
      productData.providedFields.push('shortDescription');
    }

    if (row.price && row.price.toString().trim() !== '') {
      if (shouldProcess('price')) {
        const price = parseFloat(row.price);
        if (isNaN(price) || price < 0) {
          throw new Error('Invalid price value');
        }
        productData.price = price;
        productData.providedFields.push('price');
      }
    }

    if (row.saleprice && shouldProcess('salePrice')) {
      const salePrice = parseFloat(row.saleprice);
      if (!isNaN(salePrice) && salePrice >= 0) {
        productData.salePrice = salePrice;
        productData.providedFields.push('salePrice');
      }
    }

    if (row.category && row.category.trim() !== '' && shouldProcess('category')) {
      productData.categoryName = xss(row.category.trim());
      productData.providedFields.push('category');
    }

    if (row.stockquantity !== undefined && row.stockquantity !== '' && shouldProcess('stockQuantity')) {
      const stock = parseInt(row.stockquantity);
      if (!isNaN(stock)) {
        productData.stockQuantity = stock;
        productData.providedFields.push('stockQuantity');
      }
    }

    if (row.instock !== undefined && row.instock !== '' && shouldProcess('inStock')) {
      productData.inStock = this.parseBoolean(row.instock);
      productData.providedFields.push('inStock');
    }

    if (row.weight && shouldProcess('weight')) {
      const weight = parseFloat(row.weight);
      if (!isNaN(weight)) {
        productData.weight = weight;
        productData.providedFields.push('weight');
      }
    }

    if (row.dimensions && shouldProcess('dimensions')) {
      let dimensions;
      try {
        dimensions = JSON.parse(row.dimensions);
      } catch (error) {
        throw new Error('Invalid dimensions format. Use JSON: {"length": 10, "width": 5, "height": 3}');
      }
      if (typeof dimensions.length !== 'number' ||
          typeof dimensions.width !== 'number' ||
          typeof dimensions.height !== 'number') {
        throw new Error('Dimensions must include numeric length, width, and height keys');
      }
      productData.dimensions = dimensions;
      productData.providedFields.push('dimensions');
    }

    if (row.tags && shouldProcess('tags')) {
      productData.tags = row.tags.split(',').map(tag => xss(tag.trim())).filter(tag => tag.length > 0);
      productData.providedFields.push('tags');
    }

    if (row.specifications && shouldProcess('specifications')) {
      let specifications = {};
      try {
        if (row.specifications.trim().startsWith('{')) {
          specifications = JSON.parse(row.specifications);
          for (const key of Object.keys(specifications)) {
            if (typeof specifications[key] === 'string') {
              specifications[key] = xss(specifications[key]);
            }
          }
        } else {
          const specs = row.specifications.split(',');
          specs.forEach(spec => {
            const [key, value] = spec.split(':');
            if (key && value) {
              specifications[xss(key.trim())] = xss(value.trim());
            }
          });
        }
        productData.specifications = specifications;
        productData.providedFields.push('specifications');
      } catch (error) {
        throw new Error('Invalid specifications format');
      }
    }

    if (row.images && shouldProcess('images')) {
      const urls = row.images.split(',').map(img => img.trim()).filter(img => img.length > 0);
      const invalidUrls = urls.filter(url => !isValidImageUrl(url));
      if (invalidUrls.length > 0) {
        throw new Error(`Invalid image URL(s): ${invalidUrls.join(', ')}`);
      }
      productData.images = urls;
      productData.providedFields.push('images');
    }

    if (row.featured !== undefined && row.featured !== '' && shouldProcess('featured')) {
      productData.featured = this.parseBoolean(row.featured);
      productData.providedFields.push('featured');
    }

    if (row.isactive !== undefined && row.isactive !== '' && shouldProcess('isActive')) {
      productData.isActive = this.parseBoolean(row.isactive);
      productData.providedFields.push('isActive');
    }

    if (row.metatitle && shouldProcess('metaTitle')) {
      productData.metaTitle = xss(row.metatitle.trim());
      productData.providedFields.push('metaTitle');
    }

    if (row.metadescription && shouldProcess('metaDescription')) {
      productData.metaDescription = xss(row.metadescription.trim());
      productData.providedFields.push('metaDescription');
    }

    if (row.metakeywords && shouldProcess('metaKeywords')) {
      productData.metaKeywords = xss(row.metakeywords.trim());
      productData.providedFields.push('metaKeywords');
    }

    return productData;
  }

  parseBoolean(value) {
    const val = value.toString().toLowerCase().trim();
    return ['true', '1', 'yes', 'y'].includes(val);
  }

  async _processProductsBatched(products, updateExisting, fieldsToUpdate, concurrency) {
    for (let i = 0; i < products.length; i += concurrency) {
      const batch = products.slice(i, i + concurrency);
      await Promise.all(batch.map(pd => 
        this.createOrUpdateProduct(pd, updateExisting, fieldsToUpdate)
      ));
    }
  }

  async _lookupCategory(categoryName) {
    if (!categoryName) return null;
    const categorySlug = slugify(categoryName, { lower: true });
    let category = await Category.findOne({ 
      $or: [
        { name: categoryName },
        { slug: categorySlug }
      ]
    });
    if (!category) {
      category = await Category.insert({
        name: categoryName,
        slug: categorySlug
      });
    }
    return category;
  }

  async createOrUpdateProduct(productData, updateExisting, fieldsToUpdate) {
    try {
      const existingProduct = await Product.findOne({ sku: productData.sku });

      if (existingProduct) {
        if (!updateExisting) {
          this.results.skipped.push({
            row: productData.rowNumber,
            sku: productData.sku,
            reason: 'Product exists and update is disabled'
          });
          return;
        }

        let updated = false;

        if (productData.name) {
          existingProduct.name = productData.name;
          existingProduct.slug = slugify(productData.name, { lower: true });
          updated = true;
        }

        if (productData.description !== undefined) {
          existingProduct.description = productData.description;
          updated = true;
        }

        if (productData.shortDescription !== undefined) {
          existingProduct.shortDescription = productData.shortDescription;
          updated = true;
        }

        if (productData.price !== undefined) {
          existingProduct.price = productData.price;
          updated = true;
        }

        if (productData.salePrice !== undefined) {
          existingProduct.salePrice = productData.salePrice;
          updated = true;
        }

        if (productData.categoryName) {
          const category = await this._lookupCategory(productData.categoryName);
          if (category) {
            existingProduct.category = category._id;
            updated = true;
          }
        }

        if (productData.stockQuantity !== undefined) {
          existingProduct.stockQuantity = productData.stockQuantity;
          updated = true;
        }

        if (productData.inStock !== undefined) {
          existingProduct.inStock = productData.inStock;
          updated = true;
        }

        if (productData.weight !== undefined) {
          existingProduct.weight = productData.weight;
          updated = true;
        }

        if (productData.dimensions) {
          existingProduct.dimensions = productData.dimensions;
          updated = true;
        }

        if (productData.tags) {
          existingProduct.tags = productData.tags;
          updated = true;
        }

        if (productData.specifications) {
          existingProduct.specifications = productData.specifications;
          updated = true;
        }

        if (productData.images) {
          existingProduct.images = productData.images;
          updated = true;
        }

        if (productData.featured !== undefined) {
          existingProduct.featured = productData.featured;
          updated = true;
        }

        if (productData.isActive !== undefined) {
          existingProduct.isActive = productData.isActive;
          updated = true;
        }

        if (productData.metaTitle !== undefined) {
          existingProduct.metaTitle = productData.metaTitle;
          updated = true;
        }

        if (productData.metaDescription !== undefined) {
          existingProduct.metaDescription = productData.metaDescription;
          updated = true;
        }

        if (productData.metaKeywords !== undefined) {
          existingProduct.metaKeywords = productData.metaKeywords;
          updated = true;
        }

        if (updated) {
          await Product.update({ _id: existingProduct._id }, existingProduct);
          this.results.updated++;
          console.log(`Updated: ${productData.sku} (${productData.providedFields.join(', ')})`);
        } else {
          this.results.skipped.push({
            row: productData.rowNumber,
            sku: productData.sku,
            reason: 'No fields to update'
          });
        }

      } else {
        if (!productData.name) {
          this.results.errors.push({
            row: productData.rowNumber,
            sku: productData.sku,
            error: 'Name is required for new products'
          });
          return;
        }

        if (productData.price === undefined) {
          this.results.errors.push({
            row: productData.rowNumber,
            sku: productData.sku,
            error: 'Price is required for new products'
          });
          return;
        }

        if (!productData.categoryName) {
          this.results.errors.push({
            row: productData.rowNumber,
            sku: productData.sku,
            error: 'Category is required for new products'
          });
          return;
        }

        const category = await this._lookupCategory(productData.categoryName);
        if (!category) {
          this.results.errors.push({
            row: productData.rowNumber,
            sku: productData.sku,
            error: `Failed to find or create category: ${productData.categoryName}`
          });
          return;
        }

        await Product.insert({
          name: productData.name,
          description: productData.description || '',
          shortDescription: productData.shortDescription || '',
          price: productData.price,
          salePrice: productData.salePrice,
          sku: productData.sku,
          category: category._id,
          stockQuantity: productData.stockQuantity || 0,
          inStock: productData.inStock !== undefined ? productData.inStock : true,
          weight: productData.weight,
          dimensions: productData.dimensions,
          tags: productData.tags || [],
          specifications: productData.specifications || {},
          images: productData.images || [],
          featured: productData.featured || false,
          isActive: productData.isActive !== undefined ? productData.isActive : true,
          metaTitle: productData.metaTitle || '',
          metaDescription: productData.metaDescription || '',
          metaKeywords: productData.metaKeywords || ''
        });
        this.results.imported++;
        console.log(`Created: ${productData.sku}`);
      }

    } catch (error) {
      this.results.errors.push({
        row: productData.rowNumber,
        sku: productData.sku,
        error: error.message
      });
    }
  }

  generateSampleCSV(updateOnly = false) {
    if (updateOnly) {
      const sampleData = [
        {
          sku: 'SAMPLE001',
          stockQuantity: 50,
          price: 189.99,
          inStock: true
        },
        {
          sku: 'SAMPLE002',
          stockQuantity: 0,
          inStock: false
        }
      ];

      const headers = ['sku', 'stockQuantity', 'price', 'inStock'];
      let csvContent = headers.join(',') + '\n';

      sampleData.forEach(row => {
        const values = headers.map(header => row[header] !== undefined ? row[header] : '');
        csvContent += values.join(',') + '\n';
      });

      return csvContent;
    }

    const sampleData = [
      {
        name: 'Sample Product',
        description: 'This is a sample product description',
        shortDescription: 'Sample product',
        price: 199.99,
        salePrice: 179.99,
        sku: 'SAMPLE001',
        category: 'Mining Equipment',
        stockQuantity: 100,
        weight: 5.5,
        dimensions: '{"length": 10, "width": 5, "height": 3}',
        tags: 'mining,equipment,heavy duty',
        specifications: '{"brand": "Sample Brand", "model": "SB-001", "power": "500W"}',
        images: 'https://example.com/image1.jpg,https://example.com/image2.jpg',
        featured: false,
        isActive: true,
        inStock: true,
        metaTitle: 'Sample Product | Mining Equipment | Mineazy',
        metaDescription: 'This is a sample product description for mining equipment',
        metaKeywords: 'mining,equipment,sample'
      }
    ];

    const headers = [
      'name', 'description', 'shortDescription', 'price', 'salePrice', 'sku',
      'category', 'stockQuantity', 'weight', 'dimensions', 'tags',
      'specifications', 'images', 'featured', 'isActive', 'inStock',
      'metaTitle', 'metaDescription', 'metaKeywords'
    ];

    let csvContent = headers.join(',') + '\n';

    sampleData.forEach(row => {
      const values = headers.map(header => {
        let value = row[header];
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        return value || '';
      });
      csvContent += values.join(',') + '\n';
    });

    return csvContent;
  }

  getImportTemplate() {
    return {
      requiredFieldsForNew: [
        { field: 'sku', type: 'string', description: 'Stock Keeping Unit - unique identifier (ALWAYS REQUIRED)' },
        { field: 'name', type: 'string', description: 'Product name (required for new products)' },
        { field: 'price', type: 'number', description: 'Product price (required for new products)' },
        { field: 'category', type: 'string', description: 'Category name (required for new products)' }
      ],
      requiredFieldsForUpdate: [
        { field: 'sku', type: 'string', description: 'Stock Keeping Unit - to identify product (ALWAYS REQUIRED)' }
      ],
      optionalFields: [
        { field: 'description', type: 'string', description: 'Detailed product description' },
        { field: 'shortDescription', type: 'string', description: 'Brief product description' },
        { field: 'salePrice', type: 'number', description: 'Sale/discounted price' },
        { field: 'stockQuantity', type: 'number', description: 'Available stock quantity' },
        { field: 'inStock', type: 'boolean', description: 'true/false - whether product is in stock' },
        { field: 'weight', type: 'number', description: 'Product weight in kg' },
        { field: 'dimensions', type: 'json', description: 'Product dimensions: {"length": 10, "width": 5, "height": 3}' },
        { field: 'tags', type: 'string', description: 'Comma-separated tags: tag1,tag2,tag3' },
        { field: 'specifications', type: 'json/string', description: 'JSON object or key:value pairs separated by commas' },
        { field: 'images', type: 'string', description: 'Comma-separated image URLs (must be valid http/https URLs)' },
        { field: 'featured', type: 'boolean', description: 'true/false - whether product is featured' },
        { field: 'isActive', type: 'boolean', description: 'true/false - whether product is active' },
        { field: 'metaTitle', type: 'string', description: 'SEO meta title (overrides auto-generated)' },
        { field: 'metaDescription', type: 'string', description: 'SEO meta description (overrides auto-generated)' },
        { field: 'metaKeywords', type: 'string', description: 'SEO meta keywords (comma-separated)' }
      ],
      importModes: [
        {
          mode: 'create_only',
          description: 'Create new products only, skip existing SKUs',
          usage: 'Use full CSV with all required fields'
        },
        {
          mode: 'update_only',
          description: 'Update existing products only, skip missing SKUs',
          usage: 'Include only SKU and fields you want to update'
        },
        {
          mode: 'create_and_update',
          description: 'Create new products and update existing ones',
          usage: 'Include all fields for new products, partial fields for updates'
        }
      ],
      updateExamples: [
        {
          scenario: 'Update stock quantities only',
          csvContent: 'sku,stockQuantity\nPROD-001,50\nPROD-002,75'
        },
        {
          scenario: 'Update prices and stock',
          csvContent: 'sku,price,salePrice,stockQuantity\nPROD-001,99.99,89.99,50'
        },
        {
          scenario: 'Mark products as inactive',
          csvContent: 'sku,isActive,inStock\nPROD-001,false,false'
        }
      ],
      notes: [
        'SKU is ALWAYS required - it identifies which product to update or create',
        'For updates: only include fields you want to change',
        'For new products: include name, price, and category at minimum',
        'Empty cells are ignored during updates',
        'Category will be matched by name or slug, created if not found',
        'Boolean fields accept: true/false, 1/0, yes/no',
        'Image URLs must be valid http/https URLs',
        'Update mode is enabled by default',
        'Pass ?concurrency=N to control parallel processing (default: 5, max: 20)'
      ]
    };
  }
}

module.exports = new CSVImporter();
