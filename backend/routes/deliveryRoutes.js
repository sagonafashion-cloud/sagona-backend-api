import express from 'express';
import { checkDelivery } from '../controllers/deliveryController.js';
import { validate, deliveryCheckRules } from '../middleware/validate.js';

const router = express.Router();

router.post('/check', deliveryCheckRules, validate, checkDelivery);

export default router;
