const express = require('express');
const Product = require('../models/Product');
const Category = require('../models/Category');
const BlogPost = require('../models/BlogPost');
const BlogCategory = require('../models/BlogCategory');
const Page = require('../models/Page');
const MongoShim = require('../utils/mongoshim');

const router = express.Router();

router.get('/structured-data/product/:slug', async (req, res) => {
  try {
    let product = await Product.findOne({ slug: req.params.slug, isActive: true });
    if (!product) {
      product = await Product.findById(req.params.slug);
    }
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    await MongoShim.populate(product, 'category', Category, 'name slug');

    const effectivePrice = product.salePrice && product.salePrice < product.price
      ? product.salePrice
      : product.price;

    const baseUrl = 'https://mineazy.co.zw';
    const imageUrl = product.images && product.images.length > 0
      ? product.images[0].startsWith('http') ? product.images[0] : `${baseUrl}${product.images[0]}`
      : undefined;

    const structured = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.metaTitle || product.name,
      description: product.metaDescription || product.shortDescription || product.description?.substring(0, 160),
      sku: product.sku,
      ...(imageUrl && { image: imageUrl }),
      offers: {
        '@type': 'Offer',
        price: effectivePrice,
        priceCurrency: 'USD',
        availability: product.inStock && product.stockQuantity > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        url: `${baseUrl}/product/${product.slug}`
      },
      ...(product.category?.name && {
        category: product.category.name
      })
    };

    if (product.reviewCount || product.rating) {
      structured.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: product.rating || 0,
        reviewCount: product.reviewCount || 0
      };
    }

    res.json(structured);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/structured-data/blog/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug, status: 'published' });
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    await MongoShim.populate(post, 'author', MongoShim.getModel('users'));
    await MongoShim.populate(post, 'category', BlogCategory, 'name slug');

    const baseUrl = 'https://mineazy.co.zw';

    const structured = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.metaTitle || post.title,
      description: post.metaDescription || post.excerpt || post.content?.substring(0, 160),
      ...(post.featuredImage && { image: post.featuredImage.startsWith('http') ? post.featuredImage : `${baseUrl}${post.featuredImage}` }),
      datePublished: post.publishedAt || post.createdAt,
      dateModified: post.updatedAt || post.createdAt,
      author: {
        '@type': 'Person',
        name: post.author ? `${post.author.firstName || ''} ${post.author.lastName || ''}`.trim() || 'Mineazy' : 'Mineazy'
      },
      publisher: {
        '@type': 'Organization',
        name: 'Mineazy',
        url: baseUrl
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': `${baseUrl}/blog/${post.slug}`
      },
      ...(post.category?.name && {
        about: post.category.name
      }),
      ...(post.tags?.length > 0 && {
        keywords: post.tags.join(', ')
      })
    };

    res.json(structured);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/structured-data/organization', (req, res) => {
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Mineazy',
    url: 'https://mineazy.co.zw',
    logo: 'https://mineazy.co.zw/logo.png',
    description: 'Mining equipment and solutions provider in Zimbabwe',
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+263-XXX-XXXX',
      contactType: 'sales',
      email: 'sales@mineazy.co.zw'
    },
    sameAs: []
  };

  res.json(structured);
});

router.get('/structured-data/local-business', (req, res) => {
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'Mineazy',
    url: 'https://mineazy.co.zw',
    description: 'Mining equipment and solutions provider in Zimbabwe',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'ZW'
    },
    currencyAccepted: 'USD'
  };

  res.json(structured);
});

module.exports = router;
