const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error(err);

  // Multer upload limits and file validation
  if (err.name === 'MulterError') {
    let message = err.message || 'File upload failed';

    if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files uploaded. Maximum 20 images per bulk upload request.';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = err.field === 'images'
        ? 'Too many files uploaded for this request. The server rejected extra image files.'
        : `Unexpected upload field: ${err.field || 'unknown'}`;
    } else if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'One or more files exceed the 10MB upload limit.';
    }

    error = { message, statusCode: 400 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error'
  });
};

module.exports = errorHandler;
