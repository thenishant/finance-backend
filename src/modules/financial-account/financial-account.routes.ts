import {Router} from "express";
import {authenticate} from "../../shared/middleware/auth.middleware";
import * as controller from "./financial-account.controller";

const router = Router();
router.post("/", authenticate, controller.create);
router.get("/", authenticate, controller.list);
router.get("/:id", authenticate, controller.getById);
router.get("/:id/transactions", authenticate, controller.getFinancialAccountAllTransactions);
router.get("/balance", authenticate, controller.getOverallBalance);
router.patch("/:id", authenticate, controller.update);
router.patch("/:id/archive", authenticate, controller.archive);
router.delete("/:id", authenticate, controller.remove);
export default router;