import {Router} from "express";
import {authenticate} from "../../shared/middleware/auth.middleware";
import {createBulk, list, listLeaf} from "./categories.controller";

const router = Router();

router.use(authenticate);

router.get("/", list);
router.get("/leaf", listLeaf);
router.post("/bulk", createBulk);

export default router;