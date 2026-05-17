import express from 'express';
import { customerChat } from '../controllers/chatController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Auth is optional for customer chat (anonymous sessions are allowed)
router.post('/', (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return protect(req, res, next);
  }
  next();
}, customerChat);

export default router;
