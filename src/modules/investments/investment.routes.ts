import {Router} from "express";
import {authenticate} from "../../shared/middleware/auth.middleware";
import {setGoal} from "./investment.controller";

const router = Router();

router.post("/goal", authenticate, setGoal);

export default router;