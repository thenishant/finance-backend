import {Router} from "express";
import {dashboard, monthCompare, monthly, topSpending, yearly} from "./analytics.controller";
import {authenticate} from "../../shared/middleware/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/month", monthly);
router.get("/year", yearly);
router.get("/top", topSpending);
router.get("/dashboard", dashboard);
router.get("/month-compare", monthCompare);

export default router;