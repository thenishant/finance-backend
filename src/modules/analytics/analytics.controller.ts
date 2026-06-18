import {NextFunction, Request, Response} from "express";
import {
    getMonthlyAnalytics,
    getMonthlyComparison,
    getTopSpendingCategories,
    getYearlyAnalytics
} from "./analytics.service";
import {getUserId} from "../../shared/utils/auth.utils";

export const monthly = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const label = `monthly-${Date.now()}`;
    try {
        const year = Number(req.query.year);
        const month = Number(req.query.month);
        const data = await getMonthlyAnalytics(getUserId(req), year, month);
        return res.json({success: true, data});
    } catch (error) {
        console.timeEnd(label);
        next(error);
    }
};

export const yearly = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const start = Date.now();
    try {
        const year = Number(req.query.year);
        const data = await getYearlyAnalytics(
            getUserId(req),
            year
        );
        return res.json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
};

export const topSpending = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const year = Number(req.query.year);
        const month = Number(req.query.month);
        if (!year || !month) {
            return res.status(400).json({
                success: false,
                error: {message: "Year and month are required"}
            });
        }

        const data = await getTopSpendingCategories(
            getUserId(req),
            year,
            month
        );
        return res.json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
};

export const monthCompare = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const year = Number(req.query.year);
        const month = Number(req.query.month);
        if (!year || !month) {
            return res.status(400).json({
                success: false,
                error: {message: "Year and month are required"}
            });
        }
        const data = await getMonthlyComparison(
            getUserId(req),
            year,
            month
        );
        return res.json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
};