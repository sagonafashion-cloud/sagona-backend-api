import express from 'express';
import { registerUser, loginUser, getCurrentUser, forgotPassword, resetPassword, updatePushToken } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validate, registerRules, loginRules, resetPasswordRules } from '../middleware/validate.js';

const router = express.Router();

router.post('/register',       registerRules,       validate, registerUser);
router.post('/login',          loginRules,          validate, loginUser);
router.get('/me',              protect,                       getCurrentUser);
router.post('/forgot-password',                               forgotPassword);
router.post('/reset-password', resetPasswordRules,  validate, resetPassword);
router.patch('/push-token',    protect,                       updatePushToken);

export default router;
