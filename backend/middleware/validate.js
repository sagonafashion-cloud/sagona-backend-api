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
  // Accept email or identifier (email OR phone) — both are optional individually
  body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail().withMessage('Valid email required'),
  body('identifier').optional({ checkFalsy: true }),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

export const loginRules = [
  // Accept email (mobile app) or identifier (web — email or phone)
  body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail().withMessage('Valid email required'),
  body('identifier').optional({ checkFalsy: true }),
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
  // price is read from Product DB — not required from client
  body('shippingAddress.name').trim().notEmpty().withMessage('Recipient name required'),
  // phone format is relaxed — digits only, 10 chars, but optional if not provided
  body('shippingAddress.phone').optional({ checkFalsy: true })
    .matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
  body('shippingAddress.line1').trim().notEmpty().withMessage('Address line 1 required'),
  body('shippingAddress.city').trim().notEmpty().withMessage('City required'),
  body('shippingAddress.state').trim().notEmpty().withMessage('State required'),
  body('shippingAddress.pincode').matches(/^\d{6}$/).withMessage('Pincode must be 6 digits'),
  // payment.method is used (not paymentMethod) — both accepted
  body('payment.method').optional({ checkFalsy: true })
    .isIn(['COD', 'ONLINE', 'Razorpay']).withMessage('Invalid payment method'),
];

// ── Admin products ────────────────────────────────────────
export const createProductRules = [
  body('name').trim().isLength({ min: 2, max: 200 }).withMessage('Product name required (2–200 chars)'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('sku').optional({ nullable: true, checkFalsy: true }).trim(),
  body('gstSlab').optional().isIn([0, 5, 12, 18, 28]).withMessage('GST slab must be 0, 5, 12, 18, or 28'),
];

// ── Delivery ──────────────────────────────────────────────
export const deliveryCheckRules = [
  body('pincode').matches(/^\d{6}$/).withMessage('Pincode must be 6 digits'),
];

// ── Addresses ─────────────────────────────────────────────
export const addressRules = [
  body('line1').trim().notEmpty().withMessage('Address line 1 required'),
  body('city').trim().notEmpty().withMessage('City required'),
  body('state').trim().notEmpty().withMessage('State required'),
  body('pincode').matches(/^\d{6}$/).withMessage('Pincode must be 6 digits'),
  body('phone').optional({ checkFalsy: true })
    .matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
  body('name').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('label').optional({ checkFalsy: true }).trim().isLength({ max: 30 }),
  body('isDefault').optional().isBoolean().withMessage('isDefault must be true/false'),
];

// ── Payment ───────────────────────────────────────────────
// create-order shares the same items/shippingAddress shape as createOrderRules,
// so it's reused directly at the route level rather than duplicated here.
export const verifyPaymentRules = [
  body('razorpayOrderId').trim().notEmpty().withMessage('razorpayOrderId required'),
  body('razorpayPaymentId').trim().notEmpty().withMessage('razorpayPaymentId required'),
  body('razorpaySignature').trim().notEmpty().withMessage('razorpaySignature required'),
  body('orderId').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid orderId'),
];

// ── Admin auth ────────────────────────────────────────────
export const adminLoginRules = [
  body('email').trim().notEmpty().withMessage('Email required'),
  body('password').notEmpty().withMessage('Password required'),
];

// ── Generic param validation ──────────────────────────────
export const mongoIdParam = (name = 'id') => [
  param(name).isMongoId().withMessage(`Invalid ${name}`),
];
