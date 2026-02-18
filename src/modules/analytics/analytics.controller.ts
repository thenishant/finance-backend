import {NextFunction, Response} from "express";
import {AuthRequest} from "../../shared/middleware/auth.middleware";
import {
    getMonthlyAnalytics,
    getMonthlyComparison,
    getTopSpendingCategories,
    getYearlyAnalytics
} from "./analytics.service";

export const monthly = async (
    req: AuthRequest,
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

        const data = await getMonthlyAnalytics(
            req.user!.userId,
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

export const yearly = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const year = Number(req.query.year);

        if (!year) {
            return res.status(400).json({
                success: false,
                error: {message: "Year is required"}
            });
        }

        const data = await getYearlyAnalytics(
            req.user!.userId,
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
    req: AuthRequest,
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
            req.user!.userId,
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
    req: AuthRequest,
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
            req.user!.userId,
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