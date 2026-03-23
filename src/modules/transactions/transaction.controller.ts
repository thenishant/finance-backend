import {NextFunction, Request, Response} from "express";

import {AuthRequest} from "../../shared/middleware/auth.middleware";
import {createTransactionSchema} from "./transaction.dto";

import {createTransaction, deleteTransaction, getTransactions, restoreTransaction,} from "./transaction.service";

/**
 * ✅ Generic typed request
 */
type TypedRequest<Params = {}, Body = {}> = Request<
    Params,
    any,
    Body
> &
    AuthRequest;

/**
 * ============================
 * CREATE
 * ============================
 */
export const create = async (
    req: TypedRequest<{}, any>,
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
            data: transaction,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * ============================
 * DELETE (Soft Delete)
 * ============================
 */
type IdParams = { id: string };

export const remove = async (
    req: TypedRequest<IdParams>,
    res: Response,
    next: NextFunction
) => {
    try {
        const id = req.params.id; // ✅ always string

        await deleteTransaction(req.user!.userId, id);

        return res.json({
            success: true,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * ============================
 * RESTORE
 * ============================
 */
export const restore = async (
    req: TypedRequest<IdParams>,
    res: Response,
    next: NextFunction
) => {
    try {
        const id = req.params.id; // ✅ always string

        await restoreTransaction(req.user!.userId, id);

        return res.json({
            success: true,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * ============================
 * GET ALL
 * ============================
 */
export const getAllTransactions = async (
    req: TypedRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const transactions = await getTransactions(req.user!.userId);

        return res.json({
            success: true,
            data: transactions,
        });
    } catch (error) {
        next(error);
    }
};