const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value || '');

const isValidImageUrl = (value) => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol);
  } catch { return false; }
};

const isLegacyLocalUploadPath = (value) =>
  typeof value === 'string' && /^\/?uploads\//i.test(value.trim());

const canServeLegacyLocalUploads = () => {
  if (process.env.ALLOW_LEGACY_LOCAL_UPLOADS === 'true') {
    return true;
  }

  return process.env.NODE_ENV !== 'production';
};

const sanitizeProductImage = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (isLegacyLocalUploadPath(trimmed) && !canServeLegacyLocalUploads()) {
    return '';
  }

  return trimmed;
};

const sanitizeProductImages = (images = []) => {
  if (!Array.isArray(images)) {
    return [];
  }

  return Array.from(
    new Set(
      images
        .map(sanitizeProductImage)
        .filter(Boolean)
    )
  );
};

const sanitizeProductRecord = (product) => {
  if (!product) {
    return product;
  }

  if (typeof product.toObject === 'function') {
    const plain = product.toObject();
    plain.images = sanitizeProductImages(plain.images);
    return plain;
  }

  return {
    ...product,
    images: sanitizeProductImages(product.images)
  };
};

module.exports = {
  isAbsoluteUrl,
  isValidImageUrl,
  isLegacyLocalUploadPath,
  sanitizeProductImage,
  sanitizeProductImages,
  sanitizeProductRecord,
};
