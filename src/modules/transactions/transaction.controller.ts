import {NextFunction, Response} from "express";
import {AuthRequest} from "../../shared/middleware/auth.middleware";
import {createTransactionSchema} from "./transaction.dto";
import {createTransaction, deleteTransaction, getTransactions, restoreTransaction} from "./transaction.service";
import {prisma} from "../../database/prisma";

// CREATE
export const create = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const validated = createTransactionSchema.parse(req.body);

        const transaction = await createTransaction(
            req.user!.userId,
            validated
        );

        return res.status(201).json({
            success: true,
            data: transaction
        });
    } catch (error) {
        next(error);
    }
};

export const getAllTransactions = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const transactions = await prisma.transaction.findMany({
            where: {
                userId: req.user!.userId,
                deletedAt: null
            },
            include: {
                category: true,
                fromAccount: true,
                toAccount: true
            },
            orderBy: {
                date: "desc"
            }
        });

        res.json({
            success: true,
            data: transactions
        });

    } catch (error) {
        next(error);
    }
};

// DELETE (Soft Delete + Reverse Balance)
export const remove = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const id = req.params.id;

        if (!id || Array.isArray(id)) {
            return res.status(400).json({
                success: false,
                error: {message: "Invalid transaction id"}
            });
        }

        await deleteTransaction(req.user!.userId, id);

        return res.json({
            success: true
        });
    } catch (error) {
        next(error);
    }
};

// RESTORE
export const restore = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const id = req.params.id;

        if (!id || Array.isArray(id)) {
            return res.status(400).json({
                success: false,
                error: {message: "Invalid transaction id"}
            });
        }

        await restoreTransaction(req.user!.userId, id);

        return res.json({
            success: true
        });
    } catch (error) {
        next(error);
    }
};

export const getAll = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const transactions = await getTransactions(req.user!.userId);

        res.json({
            success: true,
            data: transactions
        });
    } catch (error) {
        next(error);
    }
};