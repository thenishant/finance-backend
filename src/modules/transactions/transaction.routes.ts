import {Router} from "express";
import {create, getAllTransactions, remove, restore} from "./transaction.controller";
import {authenticate} from "../../shared/middleware/auth.middleware";

const router = Router();

router.use(authenticate);

router.post("/", create);
router.delete("/:id", remove);
router.post("/:id/restore", restore);
router.get("/", getAllTransactions);

export default router;