import express from 'express';
import { createOrder, getOrders, getMyOrders, getOrderById, updateOrder } from '../controllers/orderController.js';
import { protect, admin } from '../middleware/auth.js';
import { validate, createOrderRules } from '../middleware/validate.js';

const router = express.Router();

router.post('/',     protect,        createOrderRules, validate, createOrder);
router.get('/my',   protect,        getMyOrders);   // customer: own orders
router.get('/:id',  protect,        getOrderById);  // customer: single order
router.get('/',     protect, admin, getOrders);     // admin: all orders
router.put('/:id',  protect, admin, updateOrder);

export default router;