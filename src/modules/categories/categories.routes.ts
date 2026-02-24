import {Router} from "express";
import {authenticate} from "../../shared/middleware/auth.middleware";
import {createBulk, list} from "./categories.controller";

const router = Router();

router.use(authenticate);

router.get("/", list);
router.post("/bulk", createBulk);

export default router;