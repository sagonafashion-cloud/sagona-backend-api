import express from 'express';
import { checkDelivery, getPincodeInfo } from '../controllers/deliveryController.js';
import { validate, deliveryCheckRules } from '../middleware/validate.js';

const router = express.Router();

router.get('/pincode/:pincode', getPincodeInfo);
router.post('/check', deliveryCheckRules, validate, checkDelivery);

export default router;
