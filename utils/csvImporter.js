const csv = require('csv-parser');
const fs = require('fs');
const Product = require('../models/Product');
const Category = require('../models/Category');
const slugify = require('slugify');

class CSVImporter {
  constructor() {
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
   */
  async importProducts(filePath, updateExisting = true, fieldsToUpdate = []) {
    return new Promise((resolve, reject) => {
      const products = [];
      let rowNumber = 1;

      fs.createReadStream(filePath)
        .pipe(csv({
          mapHeaders: ({ header, index }) => header.trim().toLowerCase()
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
            if (this.results.errors.length > 0 && this.results.errors.length > products.length * 0.5) {
              this.results.success = false;
              return resolve(this.results);
            }

            await this.processProductsBatch(products, updateExisting, fieldsToUpdate);
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
    // SKU is ALWAYS required to identify the product
    if (!row.sku || row.sku.toString().trim() === '') {
      throw new Error('SKU is required to identify products');
    }

    const sku = row.sku.toString().trim().toUpperCase();
    if (sku.length < 3 || sku.length > 20) {
      throw new Error('SKU must be between 3 and 20 characters');
    }

    // Build product data object with only provided fields
    const productData = {
      sku: sku,
      rowNumber: rowNumber,
      providedFields: [] // Track which fields were provided
    };

    // Helper to check if field should be processed
    const shouldProcess = (fieldName) => {
      return fieldsToUpdate.length === 0 || fieldsToUpdate.includes(fieldName);
    };

    // Name (only required for new products)
    if (row.name && row.name.trim() !== '') {
      if (shouldProcess('name')) {
        productData.name = row.name.trim();
        productData.providedFields.push('name');
      }
    }

    // Description
    if (row.description && shouldProcess('description')) {
      productData.description = row.description.trim();
      productData.providedFields.push('description');
    }

    // Short Description
    if (row.shortdescription && shouldProcess('shortDescription')) {
      productData.shortDescription = row.shortdescription.trim();
      productData.providedFields.push('shortDescription');
    }

    // Price
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

    // Sale Price
    if (row.saleprice && shouldProcess('salePrice')) {
      const salePrice = parseFloat(row.saleprice);
      if (!isNaN(salePrice) && salePrice >= 0) {
        productData.salePrice = salePrice;
        productData.providedFields.push('salePrice');
      }
    }

    // Category
    if (row.category && row.category.trim() !== '' && shouldProcess('category')) {
      productData.categoryName = row.category.trim();
      productData.providedFields.push('category');
    }

    // Stock Quantity
    if (row.stockquantity !== undefined && row.stockquantity !== '' && shouldProcess('stockQuantity')) {
      const stock = parseInt(row.stockquantity);
      if (!isNaN(stock)) {
        productData.stockQuantity = stock;
        productData.providedFields.push('stockQuantity');
      }
    }

    // In Stock (boolean)
    if (row.instock !== undefined && row.instock !== '' && shouldProcess('inStock')) {
      productData.inStock = this.parseBoolean(row.instock);
      productData.providedFields.push('inStock');
    }

    // Weight
    if (row.weight && shouldProcess('weight')) {
      const weight = parseFloat(row.weight);
      if (!isNaN(weight)) {
        productData.weight = weight;
        productData.providedFields.push('weight');
      }
    }

    // Dimensions
    if (row.dimensions && shouldProcess('dimensions')) {
      try {
        const dimensions = JSON.parse(row.dimensions);
        if (dimensions.length && dimensions.width && dimensions.height) {
          productData.dimensions = dimensions;
          productData.providedFields.push('dimensions');
        }
      } catch (error) {
        throw new Error('Invalid dimensions format. Use JSON: {"length": 10, "width": 5, "height": 3}');
      }
    }

    // Tags
    if (row.tags && shouldProcess('tags')) {
      productData.tags = row.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      productData.providedFields.push('tags');
    }

    // Specifications
    if (row.specifications && shouldProcess('specifications')) {
      let specifications = {};
      try {
        if (row.specifications.startsWith('{')) {
          specifications = JSON.parse(row.specifications);
        } else {
          const specs = row.specifications.split(',');
          specs.forEach(spec => {
            const [key, value] = spec.split(':');
            if (key && value) {
              specifications[key.trim()] = value.trim();
            }
          });
        }
        productData.specifications = specifications;
        productData.providedFields.push('specifications');
      } catch (error) {
        throw new Error('Invalid specifications format');
      }
    }

    // Images
    if (row.images && shouldProcess('images')) {
      productData.images = row.images.split(',').map(img => img.trim()).filter(img => img.length > 0);
      productData.providedFields.push('images');
    }

    // Featured
    if (row.featured !== undefined && row.featured !== '' && shouldProcess('featured')) {
      productData.featured = this.parseBoolean(row.featured);
      productData.providedFields.push('featured');
    }

    // Is Active
    if (row.isactive !== undefined && row.isactive !== '' && shouldProcess('isActive')) {
      productData.isActive = this.parseBoolean(row.isactive);
      productData.providedFields.push('isActive');
    }

    return productData;
  }

  parseBoolean(value) {
    const val = value.toString().toLowerCase().trim();
    return ['true', '1', 'yes', 'y'].includes(val);
  }

  async processProductsBatch(products, updateExisting, fieldsToUpdate) {
    const batchSize = 10;
    
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      await Promise.all(batch.map(productData => 
        this.createOrUpdateProduct(productData, updateExisting, fieldsToUpdate)
      ));
    }
  }

  async createOrUpdateProduct(productData, updateExisting, fieldsToUpdate) {
    try {
      // Check if product exists
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

        // Update existing product with only provided fields
        let updated = false;

        if (productData.name) {
          existingProduct.name = productData.name;
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
          let category = await Category.findOne({ name: productData.categoryName });
          if (!category) {
            category = new Category({
              name: productData.categoryName,
              slug: slugify(productData.categoryName, { lower: true })
            });
            await category.save();
          }
          existingProduct.category = category._id;
          updated = true;
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

        if (updated) {
          await existingProduct.save();
          this.results.updated++;
          console.log(`Γ£à Updated: ${productData.sku} (${productData.providedFields.join(', ')})`);
        } else {
          this.results.skipped.push({
            row: productData.rowNumber,
            sku: productData.sku,
            reason: 'No fields to update'
          });
        }

      } else {
        // Create new product - validate required fields
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

        // Find or create category
        let category = await Category.findOne({ name: productData.categoryName });
        if (!category) {
          category = new Category({
            name: productData.categoryName,
            slug: slugify(productData.categoryName, { lower: true })
          });
          await category.save();
        }

        // Create new product
        const product = new Product({
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
          isActive: productData.isActive !== undefined ? productData.isActive : true
        });

        await product.save();
        this.results.imported++;
        console.log(`Γ£à Created: ${productData.sku}`);
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
      // Sample CSV for updates only
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

    // Full sample CSV for creating products
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
        inStock: true
      }
    ];

    const headers = [
      'name', 'description', 'shortDescription', 'price', 'salePrice', 'sku',
      'category', 'stockQuantity', 'weight', 'dimensions', 'tags',
      'specifications', 'images', 'featured', 'isActive', 'inStock'
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
        { field: 'images', type: 'string', description: 'Comma-separated image URLs' },
        { field: 'featured', type: 'boolean', description: 'true/false - whether product is featured' },
        { field: 'isActive', type: 'boolean', description: 'true/false - whether product is active' }
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
        'Category will be created if it doesn\'t exist',
        'Boolean fields accept: true/false, 1/0, yes/no',
        'Update mode is enabled by default'
      ]
    };
  }
}

module.exports = new CSVImporter();