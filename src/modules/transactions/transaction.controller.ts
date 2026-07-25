import {NextFunction, Request, Response} from "express";
import {createTransactionSchema, updateTransactionSchema} from "./transaction.dto";
import * as transactionService from "./transaction.service";
import {getParamId, getUserId} from "../../shared/utils/auth.utils";


export const create = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const validated = createTransactionSchema.parse(req.body);
        const transaction = await transactionService.createTransaction(getUserId(req), validated);

        return res.status(201).json({
            success: true, data: transaction,
        });
    } catch (error) {
        next(error);
    }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await transactionService.deleteTransaction(getUserId(req), getParamId(req.params.id));

        return res.json({success: true});
    } catch (error) {
        next(error);
    }
};
export const restore = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await transactionService.restoreTransaction(getUserId(req), getParamId(req.params.id));

        return res.json({success: true});
    } catch (error) {
        next(error);
    }
};

export const getRecentTransactions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const transactions = await transactionService.getRecentTransactions(getUserId(req));

        return res.json({
            success: true, data: transactions,
        });
    } catch (error) {
        next(error);
    }
};

export const getAllTransactions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const transactions = await transactionService.getTransactions(getUserId(req));

        return res.json({
            success: true, data: transactions,
        });
    } catch (error) {
        next(error);
    }
};

export const getTransactionById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const transaction =
            await transactionService.getTransactionById(getUserId(req), getParamId(req.params.id));

        return res.json({
            success: true,
            data: transaction,
        });
    } catch (error) {
        next(error);
    }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
    try {

        const validated = updateTransactionSchema.parse(req.body);

        const transaction =
            await transactionService.updateTransaction(
                getUserId(req),
                getParamId(req.params.id),
                validated
            );

        return res.json({
            success: true,
            data: transaction,
        });

    } catch (error) {
        next(error);
    }
};