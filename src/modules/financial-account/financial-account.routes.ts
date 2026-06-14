import {Router} from "express";
import {authenticate} from "../../shared/middleware/auth.middleware";
import * as controller from "./financial-account.controller";

const router = Router();
router.post("/", authenticate, controller.create);
router.get("/", authenticate, controller.list);
router.patch("/:id", authenticate, controller.update);
router.delete("/:id", authenticate, controller.remove);
router.get("/:id/transactions", authenticate, controller.getFinancialAccountAllTransactions);
router.patch("/:id/archive", authenticate, controller.archive);
export default router;