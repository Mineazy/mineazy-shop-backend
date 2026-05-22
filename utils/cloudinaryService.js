// utils/cloudinaryService.js
// Waterfall image storage: Supabase ΓåÆ Cloudinary ΓåÆ local disk
// Returns a public URL regardless of which provider succeeded.

const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// ΓöÇΓöÇΓöÇ Cloudinary config ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ΓöÇΓöÇΓöÇ Supabase config ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL.trim();
    if (/^https?:\/\//i.test(supabaseUrl)) {
      supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
    } else {
      console.warn('ΓÜá∩╕Å  SUPABASE_URL is set but is not a valid HTTP/HTTPS URL ΓÇö Supabase storage disabled.');
    }
  } catch (err) {
    console.warn('ΓÜá∩╕Å  Failed to initialize Supabase client ΓÇö Supabase storage disabled:', err.message);
    supabase = null;
  }
} else {
  supabase = null;
}

const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';
const ALLOW_LOCAL_UPLOAD_FALLBACK =
  process.env.ALLOW_LOCAL_UPLOAD_FALLBACK === 'true' || process.env.NODE_ENV !== 'production';

// ΓöÇΓöÇΓöÇ Storage providers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

async function uploadToSupabase(buffer, originalname, folder) {
  if (!supabase) throw new Error('Supabase not configured');
  const ext = path.extname(originalname).toLowerCase();
  const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(filename, buffer, {
      contentType: `image/${ext.replace('.', '') || 'jpeg'}`,
      upsert: false,
    });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

async function uploadToCloudinary(buffer, folder) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) throw new Error('Cloudinary not configured');
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `mining-equipment/${folder}`,
        transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
        format: 'webp',
      },
      (error, result) => {
        if (error) reject(new Error(`Cloudinary upload failed: ${error.message}`));
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

async function uploadToLocal(buffer, originalname) {
  const uploadPath = 'uploads/products/';
  if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
  const ext = path.extname(originalname).toLowerCase();
  const filename = `product-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(uploadPath, filename), buffer);
  return `/uploads/products/${filename}`;
}

// ΓöÇΓöÇΓöÇ Waterfall ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

/**
 * Try Supabase first, fall back to Cloudinary, then local disk.
 * Returns { url, provider } where provider is 'supabase' | 'cloudinary' | 'local'.
 */
async function uploadImage(buffer, originalname, folder = 'products') {
  const providers = [
    { name: 'supabase',   fn: () => uploadToSupabase(buffer, originalname, folder) },
    { name: 'cloudinary', fn: () => uploadToCloudinary(buffer, folder) },
  ];

  if (ALLOW_LOCAL_UPLOAD_FALLBACK) {
    providers.push({ name: 'local', fn: () => uploadToLocal(buffer, originalname) });
  }

  for (const { name, fn } of providers) {
    try {
      const url = await fn();
      console.log(`Γ£à Image stored via ${name}: ${url}`);
      return { url, provider: name };
    } catch (err) {
      console.warn(`ΓÜá∩╕Å  ${name} storage failed, trying next: ${err.message}`);
    }
  }

  throw new Error(`All persistent storage providers failed${ALLOW_LOCAL_UPLOAD_FALLBACK ? '' : ' and local fallback is disabled'}`);
}

// ΓöÇΓöÇΓöÇ Multer middleware (memory storage ΓÇö buffers fed to waterfall) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

const ALLOWED_MIME = /jpeg|jpg|png|gif|webp|avif/;

const createUploadMiddleware = (folder = 'products', maxFiles = 20) =>
  multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB per file
      // no 'files' limit here ΓÇö controlled by .array(field, maxCount) in the route
    },
    fileFilter: (_req, file, cb) => {
      const ok = ALLOWED_MIME.test(file.mimetype) && ALLOWED_MIME.test(path.extname(file.originalname).toLowerCase());
      ok ? cb(null, true) : cb(new Error('Only image files are allowed'));
    },
  });

// ΓöÇΓöÇΓöÇ Exports ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

module.exports = {
  // Waterfall uploader ΓÇö use this for manual/custom upload logic
  uploadImage,

  // Multer middleware instances (memory storage ΓÇö call uploadImage inside your route)
  uploadProductImages:     createUploadMiddleware('products', 20),
  uploadProductImagesBulk: createUploadMiddleware('products', 20), // per-batch, batches of 20
  uploadCategoryImage:     createUploadMiddleware('categories', 1),
  uploadBlogImage:         createUploadMiddleware('blog', 1),
  ALLOW_LOCAL_UPLOAD_FALLBACK,
  SUPABASE_BUCKET,

  // Legacy Cloudinary helpers
  deleteImage: async (publicId) => {
    try { return await cloudinary.uploader.destroy(publicId); }
    catch (err) { console.error('Error deleting Cloudinary image:', err); throw err; }
  },

  getOptimizedUrl: (url, options = {}) => {
    const defaults = { width: 800, height: 800, crop: 'fill', quality: 'auto', fetch_format: 'auto' };
    const transformation = { ...defaults, ...options };
    const match = url.match(/upload\/(?:v\d+\/)?(.*?)(?:\.[^.]+)?$/);
    return (match?.[1]) ? cloudinary.url(match[1], { transformation }) : url;
  },
};
