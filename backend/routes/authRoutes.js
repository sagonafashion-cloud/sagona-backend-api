import express from 'express';
import { registerUser, loginUser, getCurrentUser, updateProfile, forgotPassword, resetPassword, updatePushToken, getAddresses, saveAddress, updateAddress, deleteAddress } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validate, registerRules, loginRules, resetPasswordRules, addressRules, mongoIdParam } from '../middleware/validate.js';
import { loginLimiter, registerLimiter, passwordResetLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/register',        registerLimiter,      registerRules,       validate, registerUser);
router.post('/login',           loginLimiter,         loginRules,          validate, loginUser);
router.get('/me',               protect,                       getCurrentUser);
router.put('/me',               protect,                       updateProfile);
router.post('/forgot-password', passwordResetLimiter,                      forgotPassword);
router.post('/reset-password',  passwordResetLimiter, resetPasswordRules,  validate, resetPassword);
router.patch('/push-token',     protect,                       updatePushToken);

router.get('/addresses',        protect,                                                          getAddresses);
router.post('/addresses',       protect,                       addressRules,                      validate, saveAddress);
router.put('/addresses/:id',    protect, mongoIdParam('id'),    addressRules,                      validate, updateAddress);
router.delete('/addresses/:id', protect, mongoIdParam('id'),                                       validate, deleteAddress);

export default router;
