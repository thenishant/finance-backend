import {Router} from "express";
import {setInvestmentGoal} from "./investment.controller";
import {authenticate} from "../../shared/middleware/auth.middleware";

const router = Router();

router.post("/goal", authenticate, setInvestmentGoal);

export default router;