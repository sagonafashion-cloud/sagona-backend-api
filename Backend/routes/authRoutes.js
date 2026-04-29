import express from 'express';
import { registerUser, loginUser, getCurrentUser } from "../controllers/authController.js";

const router = express.Router();
router.post('/register', register);
router.post('/login', login);

export default router;