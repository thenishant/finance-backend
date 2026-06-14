import {NextFunction, Request, Response} from "express";
import {createTransactionSchema} from "./transaction.dto";
import {createTransaction, deleteTransaction, getTransactions, restoreTransaction,} from "./transaction.service";
import {getParamId, getUserId} from "../../shared/utils/auth.utils";


export const create = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const validated = createTransactionSchema.parse(req.body);
        const transaction = await createTransaction(getUserId(req), validated);

        return res.status(201).json({
            success: true, data: transaction,
        });
    } catch (error) {
        next(error);
    }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await deleteTransaction(getUserId(req), getParamId(req.params.id));

        return res.json({success: true});
    } catch (error) {
        next(error);
    }
};
export const restore = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await restoreTransaction(getUserId(req), getParamId(req.params.id));

        return res.json({success: true});
    } catch (error) {
        next(error);
    }
};
export const getAllTransactions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const transactions = await getTransactions(getUserId(req));

        return res.json({
            success: true, data: transactions,
        });
    } catch (error) {
        next(error);
    }
};