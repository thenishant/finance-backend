import {Router} from "express";
import {authenticate} from "../../shared/middleware/auth.middleware";
import {createBulk, list, listLeaf} from "./categories.controller";

const router = Router();

router.use(authenticate);

router.get("/categories", list);
router.get("/categories/leaf", listLeaf);
router.post("/categories/bulk", createBulk);

export default router;