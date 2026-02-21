import {Router} from 'express';
import {googleLogin, login, logout, register} from './auth.controller';

const router = Router();

router.post("/google", googleLogin);
router.post('/register', register);
router.post("/logout", logout);
router.post('/login', login);

export default router;