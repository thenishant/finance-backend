import {Router} from "express";
import {monthCompare, monthly, topSpending, yearly} from "./analytics.controller";
import {authenticate} from "../../shared/middleware/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/month", monthly);

router.get("/month", monthly);
router.get("/year", yearly);
router.get("/top", topSpending);
router.get("/month-compare", monthCompare);

export default router;