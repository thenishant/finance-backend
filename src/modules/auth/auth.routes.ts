import {Router} from 'express';
import {googleLogin, login, logout, me, register} from './auth.controller';
import {authenticate} from '../../shared/middleware/auth.middleware';

const router = Router();

router.post("/google", googleLogin);
router.post('/register', register);
router.post("/logout", logout);
router.post('/login', login);

router.get('/me', authenticate, me);

export default router;
