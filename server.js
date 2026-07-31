const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Create upload directories if they don't exist
const createUploadDirectories = () => {
  const directories = [
    'uploads',
    'uploads/products',
    'uploads/categories',
    'uploads/blog',
    'uploads/csv',
    'uploads/media',
    'data'
  ];

  directories.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });

  console.log('Upload directories ready');
};

// Call this before starting the server
createUploadDirectories();

// Load environment variables
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please check your .env file and ensure all required variables are set.');
  process.exit(1);
}

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const checkoutRoutes = require('./routes/checkout');
const paymentRoutes = require('./routes/payments');
const invoiceRoutes = require('./routes/invoices');
const quoteRoutes = require('./routes/quotes');
const blogRoutes = require('./routes/blog');
const contactRoutes = require('./routes/contact');
const pageRoutes = require('./routes/pages');
const emailRoutes = require('./routes/emails');
const adminRoutes = require('./routes/admin');
const searchRoutes = require('./routes/search');
const mediaRoutes = require('./routes/media');
const seoRoutes = require('./routes/seo');
const catalogRoutes = require('./routes/catalog');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

const app = express();
app.set('trust proxy', 1); // Required on Render (sits behind a reverse proxy)

// Set default NODE_ENV if not provided
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", ...(process.env.CSP_CONNECT_SRC ? process.env.CSP_CONNECT_SRC.split(',').map(src => src.trim()) : [])],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));

const allowedOrigins = [
  'https://mineazy.co.zw',
  'https://www.mineazy.co.zw',
  'https://mineazy-shop.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(o => o.trim()) : []),
  ...(process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [])
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true
}));

app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: NODE_ENV === 'production' ? 100 : 1000,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: NODE_ENV === 'production' ? 5 : 50,
  message: {
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files served to the separate storefront/admin origins must opt into cross-origin embedding.
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/catalog', catalogRoutes);

// SEO routes
app.use('/api/seo', seoRoutes);

// Search engine crawling endpoints (at root level)
app.get('/robots.txt', (req, res) => {
  const robots = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /checkout
Disallow: /cart

Sitemap: https://mineazy.co.zw/sitemap.xml

# Host
Host: https://mineazy.co.zw
`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(robots);
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = 'https://mineazy.co.zw';

    const Product = require('./models/Product');
    const Category = require('./models/Category');
    const BlogPost = require('./models/BlogPost');
    const Page = require('./models/Page');

    const [products, categories, posts, pages] = await Promise.all([
      Product.find({ isActive: true }).sort({ updatedAt: -1 }),
      Category.find({ isActive: true }).sort({ name: 1 }),
      BlogPost.find({ status: 'published' }).sort({ publishedAt: -1 }),
      Page.find({ isPublished: true }).sort({ updatedAt: -1 })
    ]);

    const urls = [];

    urls.push({ loc: baseUrl, priority: '1.0', changefreq: 'daily' });
    urls.push({ loc: `${baseUrl}/shop`, priority: '0.9', changefreq: 'daily' });
    urls.push({ loc: `${baseUrl}/blog`, priority: '0.8', changefreq: 'weekly' });
    urls.push({ loc: `${baseUrl}/contact`, priority: '0.7', changefreq: 'monthly' });
    urls.push({ loc: `${baseUrl}/about`, priority: '0.7', changefreq: 'monthly' });
    urls.push({ loc: `${baseUrl}/quote`, priority: '0.6', changefreq: 'monthly' });

    for (const product of products) {
      urls.push({
        loc: `${baseUrl}/product/${product.slug}`,
        priority: '0.8',
        changefreq: 'weekly',
        lastmod: product.updatedAt || product.createdAt
      });
    }

    for (const category of categories) {
      urls.push({
        loc: `${baseUrl}/category/${category.slug}`,
        priority: '0.7',
        changefreq: 'weekly'
      });
    }

    for (const post of posts) {
      urls.push({
        loc: `${baseUrl}/blog/${post.slug}`,
        priority: '0.6',
        changefreq: 'monthly',
        lastmod: post.updatedAt || post.publishedAt
      });
    }

    for (const page of pages) {
      urls.push({
        loc: `${baseUrl}/page/${page.slug}`,
        priority: '0.5',
        changefreq: 'monthly',
        lastmod: page.updatedAt || page.createdAt
      });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <priority>${u.priority}</priority>
    <changefreq>${u.changefreq}</changefreq>${u.lastmod ? `\n    <lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'file-based (NeDB)'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Mining Equipment Backend API',
    version: '1.0.0',
    environment: NODE_ENV,
    status: 'Running'
  });
});

// Optional: serve admin panel build when `SERVE_ADMIN=true` (cPanel unified deployment)
// Must register before the frontend catch-all to avoid wildcard hijacking
if (process.env.SERVE_ADMIN === 'true') {
  const candidateAdminPaths = [
    path.join(__dirname, '..', 'admin', 'dist'),
    path.join(__dirname, 'admin_build'),
  ];
  const adminBuildPath = candidateAdminPaths.find(fs.existsSync);

  if (adminBuildPath) {
    console.log('Serving admin panel from', adminBuildPath);
    app.use('/admin', express.static(adminBuildPath));
    // Admin Vite build uses root-relative /assets/... paths; serve them at root level
    app.use('/assets', express.static(path.join(adminBuildPath, 'assets')));
    app.get('/admin*', (req, res) => {
      res.sendFile(path.join(adminBuildPath, 'index.html'));
    });
  } else {
    console.warn('SERVE_ADMIN enabled but admin build not found in any expected location:', candidateAdminPaths.join(', '));
  }
}

// Optional: serve frontend build when `SERVE_FRONTEND=true`
if (process.env.SERVE_FRONTEND === 'true') {
  const candidatePaths = [
    path.join(__dirname, '..', 'frontend', 'build'),
    path.join(__dirname, 'frontend_build'),
  ];
  const frontendBuildPath = candidatePaths.find(fs.existsSync);

  if (frontendBuildPath) {
    console.log('Serving frontend from', frontendBuildPath);
    app.use(express.static(frontendBuildPath));

    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendBuildPath, 'index.html'));
    });
  } else {
    console.warn('SERVE_FRONTEND enabled but frontend build not found in any expected location:', candidatePaths.join(', '));
  }
}

// Error handling
app.use(notFound);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log('=====================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log('=====================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
  });
});

module.exports = app;
