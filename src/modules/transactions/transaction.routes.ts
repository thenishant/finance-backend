import {Router} from "express";
import * as transactionController from "./transaction.controller";
import {authenticate} from "../../shared/middleware/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/", authenticate, transactionController.getAllTransactions);
router.get("/recent", authenticate, transactionController.getRecentTransactions);
router.post("/", authenticate, transactionController.create);
router.get("/:id", authenticate, transactionController.getTransactionById);
router.delete("/:id", authenticate, transactionController.remove);
router.patch("/:id/restore", authenticate, transactionController.restore);
router.put("/:id", authenticate, transactionController.update);
export default router;