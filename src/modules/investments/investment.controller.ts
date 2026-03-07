import {Response} from "express";
import {AuthRequest} from "../../shared/middleware/auth.middleware";
import {setInvestmentGoal} from "./investment.service";

export const setGoal = async (
    req: AuthRequest,
    res: Response
) => {
    try {

        const userId = req.user!.userId;
        const {year, month, goalPercent} = req.body;

        if (!year || goalPercent === undefined) {
            return res.status(400).json({
                success: false,
                error: {message: "year and goalPercent are required"}
            });
        }

        if (goalPercent < 0 || goalPercent > 100) {
            return res.status(400).json({
                success: false,
                error: {message: "goalPercent must be between 0 and 100"}
            });
        }

        if (month && (month < 1 || month > 12)) {
            return res.status(400).json({
                success: false,
                error: {message: "month must be between 1 and 12"}
            });
        }

        const goal = await setInvestmentGoal(
            userId,
            Number(year),
            Number(goalPercent),
            month ? Number(month) : undefined
        );

        return res.json({
            success: true,
            data: goal
        });

    } catch (error) {

        console.error("setInvestmentGoal error:", error);

        return res.status(500).json({
            success: false,
            error: {message: "Failed to set investment goal"}
        });
    }
};