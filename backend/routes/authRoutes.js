import express from 'express';
import { registerUser, loginUser, getCurrentUser, updateProfile, forgotPassword, resetPassword, updatePushToken, getAddresses, saveAddress, deleteAddress } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validate, registerRules, loginRules, resetPasswordRules } from '../middleware/validate.js';

const router = express.Router();

router.post('/register',        registerRules,       validate, registerUser);
router.post('/login',           loginRules,          validate, loginUser);
router.get('/me',               protect,                       getCurrentUser);
router.put('/me',               protect,                       updateProfile);
router.post('/forgot-password',                                forgotPassword);
router.post('/reset-password',  resetPasswordRules,  validate, resetPassword);
router.patch('/push-token',     protect,                       updatePushToken);

router.get('/addresses',        protect,                       getAddresses);
router.post('/addresses',       protect,                       saveAddress);
router.delete('/addresses/:id', protect,                       deleteAddress);

export default router;
