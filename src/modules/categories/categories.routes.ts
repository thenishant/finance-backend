import {Router} from "express";
import {authenticate} from "../../shared/middleware/auth.middleware";
import {create, createBulk, list} from "./categories.controller";

const router = Router();

router.use(authenticate);

router.get("/", list);
router.post("/", create);
router.post("/bulk", createBulk);

export default router;