import {Router} from 'express';
import {getGoogleUrl, googleLogin, login, logout, register} from './auth.controller';
import {authenticate} from "../../shared/middleware/auth.middleware";

const router = Router();

router.post("/google", googleLogin);
router.post('/register', register);
router.post("/logout", logout);
router.post('/login', login);
router.get("/google/url", authenticate, getGoogleUrl);
export default router;