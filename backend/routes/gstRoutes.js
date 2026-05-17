import express from 'express';
import {
  getGstr1,
  getGstr3b,
  getHsnSummary,
  getInvoiceRegister,
  exportGstReport,
  getConsolidated
} from '../controllers/gstController.js';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';

const router = express.Router();

const canView = requireRole('super_admin', 'finance_manager');

router.use(adminProtect, canView);

router.get('/gstr1',            getGstr1);
router.get('/gstr3b',           getGstr3b);
router.get('/hsn',              getHsnSummary);
router.get('/invoices',         getInvoiceRegister);
router.get('/export',           exportGstReport);
router.get('/consolidated',     getConsolidated);

export default router;
