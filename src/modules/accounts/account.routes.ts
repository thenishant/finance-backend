import {Router} from 'express';
import {create, list, remove} from './account.controller';
import {authenticate} from '../../shared/middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/', create);
router.get('/', list);
router.delete('/:id', remove);

export default router;