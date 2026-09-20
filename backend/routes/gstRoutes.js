import express from 'express';
import {
  getGstr1,
  getGstr3b,
  getHsnSummary,
  getInvoiceRegister,
  exportGstReport,
  getConsolidated,
  getGstr1Summary,
  getGstr2Summary,
  getGstr3bSummary,
  exportGstSummary
} from '../controllers/gstController.js';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';

const router = express.Router();

const canView = requireRole('super_admin', 'finance_manager');

router.use(adminProtect, canView);

router.get('/gstr1',            getGstr1);
router.get('/gstr3b',           getGstr3b);
router.get('/hsn-summary',      getHsnSummary);
router.get('/invoices',         getInvoiceRegister);
router.get('/export',           exportGstReport);
router.get('/consolidated',     getConsolidated);

// Phase 4 — exact-format summary reports (see gstController.js).
router.get('/gstr1/summary',    getGstr1Summary);
router.get('/gstr2/summary',    getGstr2Summary);
router.get('/gstr3b/summary',   getGstr3bSummary);
router.get('/export/summary',   exportGstSummary);

export default router;
