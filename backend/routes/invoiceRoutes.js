import express from 'express';
import { downloadInvoice } from '../controllers/invoiceController.js';

const router = express.Router();

// Public — no adminProtect/protect middleware. Scoped strictly to one
// order's invoice via its orderNumber (see invoiceController.js for the
// trust-boundary reasoning). This is what the emailed "Download Invoice"
// link points at.
router.get('/:orderNumber', downloadInvoice);

export default router;
