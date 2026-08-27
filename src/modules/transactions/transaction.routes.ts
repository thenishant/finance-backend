import {Router} from "express";
import * as transactionController from "./transaction.controller";
import {authenticate} from "../../shared/middleware/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/", transactionController.getAllTransactions);
router.get("/recent", transactionController.getRecentTransactions);
router.post("/", transactionController.create);
router.get("/:id", transactionController.getTransactionById);
router.delete("/:id", transactionController.remove);
router.patch("/:id/restore", transactionController.restore);
router.put("/:id", transactionController.update);
export default router;
