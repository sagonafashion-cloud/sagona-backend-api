import express from 'express';
import {
  adminLogin,
  verifyTwoFactor,
  setupTwoFactor,
  confirmTwoFactorSetup,
  getMe,
  adminLogout,
  listAdmins,
  createAdmin
} from '../controllers/adminAuthController.js';
import { adminProtect } from '../middleware/adminAuth.js';

const router = express.Router();

router.post('/login', adminLogin);
router.post('/verify-2fa', verifyTwoFactor);

// Protected
router.post('/setup-2fa', adminProtect, setupTwoFactor);
router.post('/confirm-2fa', adminProtect, confirmTwoFactorSetup);
router.get('/me', adminProtect, getMe);
router.post('/logout', adminProtect, adminLogout);
router.get('/users',  adminProtect, listAdmins);
router.post('/users', adminProtect, createAdmin);

export default router;
