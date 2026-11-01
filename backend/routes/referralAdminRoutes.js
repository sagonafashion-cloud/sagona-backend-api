import express from 'express';
import multer from 'multer';
import { adminProtect, requireRole } from '../middleware/adminAuth.js';
import * as c from '../controllers/referralAdminController.js';
import * as pc from '../controllers/referralPayoutController.js';

// Mounted at /api/admin/promoters ONLY when REFERRAL_ENABLED=true (see server.js).
//
// Permission matrix (enforced server side; hiding menu items is not security):
//   READ  : super_admin, finance_manager   (finance_manager = the "accountant" role)
//   WRITE : super_admin only
// store_manager / content_editor / viewer have no access to promoter data.
const READ = ['super_admin', 'finance_manager'];
const WRITE = ['super_admin'];

// Tag each role guard with the roles it allows so tests can audit the whole matrix.
const guard = (roles) => {
  const mw = requireRole(...roles);
  mw.allowedRoles = roles;
  return mw;
};
const read = guard(READ);
const write = guard(WRITE);

const router = express.Router();
router.use(adminProtect);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const uploadOne = (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(422).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 5 MB' : 'Upload failed' });
    next();
  });

router.get('/ping', read, c.ping);

// settings & audit (declared before '/:id' so they are not treated as ids)
router.get('/settings', read, c.getAllSettings);
router.put('/settings', write, c.updateSettings);
router.get('/audit', read, c.listAudit);

// referred orders + commission ledger (declared before '/:id')
router.get('/orders', read, c.listReferredOrders);
router.get('/ledger', read, c.listLedger);
router.get('/ledger/balances', read, c.ledgerBalances);
router.post('/ledger/adjust', write, c.adjustLedger);

// payouts, statements, exports (declared before '/:id')
router.get('/payouts/preview', read, pc.previewPayouts);
router.get('/payouts', read, pc.listBatches);
router.post('/payouts', write, pc.createBatch);
router.get('/payouts/:id', read, pc.getBatch);
router.post('/payouts/:id/approve', write, pc.approveBatch);
router.post('/payouts/:id/paid', write, pc.markPaid);
router.post('/payouts/:id/cancel', write, pc.cancelBatch);
router.get('/payouts/:id/bank-file', write, pc.bankFile);          // full account numbers: super_admin only
router.post('/payout-items/:itemId/fail', write, pc.failItem);
router.get('/statements/:promoterId', read, pc.statement);
router.get('/exports/payouts', read, pc.accountingExport);
router.get('/exports/tds', read, pc.tdsExport);

// commission rates (insert-only)
router.get('/rates', read, c.listRates);
router.get('/rates/effective', read, c.effectiveRate);
router.post('/rates', write, c.createRate);

// referral codes
router.get('/codes', read, c.listCodes);
router.post('/codes', write, c.createCode);
router.post('/codes/bulk', write, c.bulkCreateCodes);
router.put('/codes/:id', write, c.updateCode);
router.post('/codes/:id/pause', write, c.pauseCode);
router.post('/codes/:id/resume', write, c.resumeCode);
router.post('/codes/:id/expire', write, c.expireCode);

// promoters
router.get('/', read, c.listPromoters);
router.post('/', write, c.createPromoter);
router.get('/:id', read, c.getPromoter);
router.put('/:id', write, c.updatePromoter);
router.post('/:id/status', write, c.setPromoterStatus);
router.post('/:id/kyc', write, c.setPromoterKyc);
router.post('/:id/agreement', write, c.setPromoterAgreement);
router.post('/:id/strike', write, c.addStrike);
router.post('/:id/reveal', write, c.revealSensitive);
router.post('/:id/documents', write, uploadOne, c.uploadDocument);
router.get('/:id/documents/:docId', write, c.downloadDocument);

export default router;
