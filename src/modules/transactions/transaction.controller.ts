import {NextFunction, Request, Response} from "express";
import {AuthRequest} from "../../shared/middleware/auth.middleware";
import {createTransactionSchema} from "./transaction.dto";
import {createTransaction, deleteTransaction, getTransactions, restoreTransaction,} from "./transaction.service";

type TypedRequest<Params = {}, Body = {}> = Request<Params, any, Body> & AuthRequest;

export const create = async (req: TypedRequest<{}, unknown>, res: Response, next: NextFunction) => {
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

export const remove = async (req: TypedRequest<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        await deleteTransaction(req.user!.userId, req.params.id);

        return res.json({success: true});
    } catch (error) {
        next(error);
    }
};
export const restore = async (req: TypedRequest<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        await restoreTransaction(req.user!.userId, req.params.id);

        return res.json({success: true});
    } catch (error) {
        next(error);
    }
};
export const getAllTransactions = async (req: TypedRequest, res: Response, next: NextFunction) => {
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