const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// User validation rules
const userValidation = {
  register: [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('firstName').notEmpty().trim(),
    body('lastName').notEmpty().trim(),
    body('phone').optional().isMobilePhone(),
    validate
  ],
  login: [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    validate
  ]
};

// Product validation rules
const productValidation = {
  create: [
    body('name').notEmpty().trim(),
    body('description').notEmpty(),
    body('price').isNumeric().isFloat({ min: 0 }),
    body('sku').notEmpty().trim(),
    body('category').isMongoId(),
    validate
  ]
};

// Order validation rules
const orderValidation = {
  create: [
    body('customerInfo.firstName').notEmpty().trim(),
    body('customerInfo.lastName').notEmpty().trim(),
    body('customerInfo.email').isEmail(),
    body('customerInfo.phone').notEmpty(),
    body('items').isArray({ min: 1 }),
    body('paymentMethod').isIn(['paynow', 'cash_on_delivery', 'collection']),
    validate
  ]
};

module.exports = {
  validate,
  userValidation,
  productValidation,
  orderValidation
};