import {Response} from "express";
import {setMonthlyInvestmentGoal} from "./investment.service";
import {AuthRequest} from "../../shared/middleware/auth.middleware";

export const setInvestmentGoal = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const {year, month, goalPercent} = req.body;

        if (!year || !month || goalPercent === undefined) {
            return res.status(400).json({
                success: false,
                error: {message: "year, month and goalPercent are required"}
            });
        }

        if (goalPercent < 0 || goalPercent > 100) {
            return res.status(400).json({
                success: false,
                error: {message: "goalPercent must be between 0 and 100"}
            });
        }

        const goal = await setMonthlyInvestmentGoal(
            userId,
            Number(year),
            Number(month),
            Number(goalPercent)
        );

        res.json({
            success: true,
            data: goal
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: {message: "Failed to set investment goal"}
        });
    }
};