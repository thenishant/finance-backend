import {Router} from "express";
import {create, getAllTransactions, remove, restore} from "./transaction.controller";
import {authenticate} from "../../shared/middleware/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/", getAllTransactions);
router.post("/", create);

router.delete("/:id", remove);
router.patch("/:id/restore", restore);

export default router;