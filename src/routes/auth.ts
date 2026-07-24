import { Router } from 'express';
import { register, login, saveOnboarding, getMe } from '../controllers/AuthController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/onboarding', authMiddleware as any, saveOnboarding as any);
router.get('/me', authMiddleware as any, getMe as any);

export default router;
