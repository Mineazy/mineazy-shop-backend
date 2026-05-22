const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { auth, authorize } = require('../middleware/auth');
const cloudinaryService = require('../utils/cloudinaryService');

const router = express.Router();
const { uploadImage, uploadProductImages } = cloudinaryService;

const MEDIA_INDEX_PATH = path.join(__dirname, '..', 'uploads', 'media', 'media-index.json');

const ensureMediaIndex = () => {
  const dir = path.dirname(MEDIA_INDEX_PATH);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(MEDIA_INDEX_PATH)) {
    fs.writeFileSync(MEDIA_INDEX_PATH, JSON.stringify({ items: [] }, null, 2));
  }
};

const readMediaIndex = () => {
  ensureMediaIndex();

  try {
    const raw = fs.readFileSync(MEDIA_INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (error) {
    return [];
  }
};

const writeMediaIndex = (items) => {
  ensureMediaIndex();
  fs.writeFileSync(MEDIA_INDEX_PATH, JSON.stringify({ items }, null, 2));
};

const parseTags = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(parseTags);
  }

  return String(value)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const normalizeFolder = (value) => {
  const folder = String(value || 'general').trim();
  return folder || 'general';
};

const getStorageType = (url) => {
  if (/cloudinary/i.test(url || '')) {
    return 'cloudinary';
  }

  if (/supabase/i.test(url || '')) {
    return 'supabase';
  }

  return 'local';
};

const getAbsoluteUrl = (req, url) => {
  if (!url) {
    return url;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `${req.protocol}://${req.get('host')}${url.startsWith('/') ? url : `/${url}`}`;
};

const toMediaResponse = (req, item) => ({
  ...item,
  url: getAbsoluteUrl(req, item.url),
  thumbnail: getAbsoluteUrl(req, item.thumbnail || item.url)
});

const deleteLocalFileIfExists = (url) => {
  if (!url || /^https?:\/\//i.test(url)) {
    return;
  }

  const relativePath = url.replace(/^\/+/, '');
  const filePath = path.join(__dirname, '..', relativePath);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

router.get('/', auth, authorize('inventory_manager', 'content_manager', 'super_admin'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 24,
      folder,
      tags,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 24, 1);
    const tagFilters = parseTags(tags).map((tag) => tag.toLowerCase());
    const searchTerm = String(search || '').trim().toLowerCase();

    let items = readMediaIndex();

    if (folder) {
      items = items.filter((item) => item.folder === folder);
    }

    if (tagFilters.length > 0) {
      items = items.filter((item) => {
        const itemTags = (item.tags || []).map((tag) => tag.toLowerCase());
        return tagFilters.every((tag) => itemTags.includes(tag));
      });
    }

    if (searchTerm) {
      items = items.filter((item) => {
        const haystack = [
          item.originalName,
          item.title,
          item.alt,
          ...(item.tags || [])
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(searchTerm);
      });
    }

    const sortableItems = [...items];
    sortableItems.sort((a, b) => {
      const direction = sortOrder === 'asc' ? 1 : -1;

      if (sortBy === 'size') {
        return ((a.size || 0) - (b.size || 0)) * direction;
      }

      if (sortBy === 'originalName') {
        return String(a.originalName || '').localeCompare(String(b.originalName || '')) * direction;
      }

      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
    });

    const totalMedia = sortableItems.length;
    const totalPages = Math.max(Math.ceil(totalMedia / limitNum), 1);
    const paginatedItems = sortableItems.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      media: paginatedItems.map((item) => toMediaResponse(req, item)),
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalMedia,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/stats/overview', auth, authorize('inventory_manager', 'content_manager', 'super_admin'), async (req, res) => {
  try {
    const items = readMediaIndex();
    const totalSizeBytes = items.reduce((sum, item) => sum + (item.size || 0), 0);
    const cloudinaryCount = items.filter((item) => item.storageType === 'cloudinary').length;
    const supabaseCount = items.filter((item) => item.storageType === 'supabase').length;

    res.json({
      totalMedia: items.length,
      totalSizeBytes,
      totalSizeMB: Math.round((totalSizeBytes / (1024 * 1024)) * 100) / 100,
      storageType: cloudinaryCount > 0 ? 'cloudinary' : supabaseCount > 0 ? 'supabase' : 'local'
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/upload', auth, authorize('inventory_manager', 'content_manager', 'super_admin'), uploadProductImages.array('images', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No images uploaded' });
    }

    const folder = normalizeFolder(req.body.folder);
    const tags = parseTags(req.body.tags);
    const title = String(req.body.title || '').trim();
    const alt = String(req.body.alt || '').trim();
    const items = readMediaIndex();

    const uploaded = [];

    for (const file of req.files) {
      const result = await uploadImage(file.buffer, file.originalname, folder);
      const now = new Date().toISOString();
      const mediaItem = {
        _id: crypto.randomUUID(),
        originalName: file.originalname,
        title: title || file.originalname,
        alt: alt || file.originalname,
        folder,
        tags,
        size: file.size,
        mimeType: file.mimetype,
        url: result.url,
        thumbnail: result.url,
        storageType: getStorageType(result.url),
        provider: result.provider,
        createdAt: now,
        updatedAt: now
      };

      items.unshift(mediaItem);
      uploaded.push(mediaItem);
    }

    writeMediaIndex(items);

    res.status(201).json({
      message: 'Media uploaded successfully',
      uploaded: uploaded.map((item) => toMediaResponse(req, item))
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/:id', auth, authorize('inventory_manager', 'content_manager', 'super_admin'), async (req, res) => {
  try {
    const item = readMediaIndex().find((entry) => entry._id === req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Media not found' });
    }

    res.json(toMediaResponse(req, item));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', auth, authorize('inventory_manager', 'content_manager', 'super_admin'), async (req, res) => {
  try {
    const items = readMediaIndex();
    const index = items.findIndex((entry) => entry._id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ message: 'Media not found' });
    }

    const current = items[index];
    items[index] = {
      ...current,
      title: req.body.title !== undefined ? String(req.body.title || '').trim() : current.title,
      alt: req.body.alt !== undefined ? String(req.body.alt || '').trim() : current.alt,
      folder: req.body.folder !== undefined ? normalizeFolder(req.body.folder) : current.folder,
      tags: req.body.tags !== undefined ? parseTags(req.body.tags) : current.tags,
      updatedAt: new Date().toISOString()
    };

    writeMediaIndex(items);

    res.json({
      message: 'Media updated successfully',
      media: toMediaResponse(req, items[index])
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', auth, authorize('inventory_manager', 'content_manager', 'super_admin'), async (req, res) => {
  try {
    const items = readMediaIndex();
    const index = items.findIndex((entry) => entry._id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ message: 'Media not found' });
    }

    const [removed] = items.splice(index, 1);
    writeMediaIndex(items);
    deleteLocalFileIfExists(removed.url);

    res.json({ message: 'Media deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/bulk-delete', auth, authorize('inventory_manager', 'content_manager', 'super_admin'), async (req, res) => {
  try {
    const mediaIds = Array.isArray(req.body.mediaIds) ? req.body.mediaIds : [];

    if (mediaIds.length === 0) {
      return res.status(400).json({ message: 'No media IDs provided' });
    }

    const items = readMediaIndex();
    const toDelete = new Set(mediaIds);
    const removedItems = items.filter((item) => toDelete.has(item._id));
    const keptItems = items.filter((item) => !toDelete.has(item._id));

    removedItems.forEach((item) => deleteLocalFileIfExists(item.url));
    writeMediaIndex(keptItems);

    res.json({
      message: 'Bulk delete completed',
      results: {
        deleted: removedItems.length,
        failed: mediaIds.length - removedItems.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
