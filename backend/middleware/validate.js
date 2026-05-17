import { validationResult, body, param } from 'express-validator';

// Runs accumulated validators and short-circuits with 422 on failure
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, errors: errors.array() });
  }
  next();
};

// ── Auth ──────────────────────────────────────────────────
export const registerRules = [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2–50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

export const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
];

export const resetPasswordRules = [
  body('email').isEmail().normalizeEmail(),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric().withMessage('OTP must be 6 digits'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

// ── Orders ────────────────────────────────────────────────
export const createOrderRules = [
  body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
  body('items.*.productId').notEmpty().withMessage('Each item needs a productId'),
  body('items.*.qty').isInt({ min: 1 }).withMessage('Qty must be a positive integer'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('Price must be non-negative'),
  body('shippingAddress.name').trim().notEmpty().withMessage('Recipient name required'),
  body('shippingAddress.phone').matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
  body('shippingAddress.line1').trim().notEmpty().withMessage('Address line 1 required'),
  body('shippingAddress.city').trim().notEmpty().withMessage('City required'),
  body('shippingAddress.state').trim().notEmpty().withMessage('State required'),
  body('shippingAddress.pincode').matches(/^\d{6}$/).withMessage('Pincode must be 6 digits'),
  body('paymentMethod').isIn(['COD', 'Razorpay']).withMessage('Invalid payment method'),
];

// ── Admin products ────────────────────────────────────────
export const createProductRules = [
  body('name').trim().isLength({ min: 2, max: 200 }).withMessage('Product name required'),
  body('sku').trim().notEmpty().withMessage('SKU required'),
  body('basePrice').isFloat({ min: 0 }).withMessage('Base price must be non-negative'),
  body('gstSlab').isIn([0, 5, 12, 18, 28]).withMessage('GST slab must be 0, 5, 12, 18, or 28'),
];

// ── Delivery ──────────────────────────────────────────────
export const deliveryCheckRules = [
  body('pincode').matches(/^\d{6}$/).withMessage('Pincode must be 6 digits'),
];
