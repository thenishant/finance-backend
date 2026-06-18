import {NextFunction, Request, Response} from "express";
import {createFinancialAccountSchema, updateFinancialAccountSchema} from "./financial-account.dto";
import * as financialAccountService from "./financial-account.service";
import {getFinancialAccountTransactions} from "./financial-account.service";
import {getParamId, getUserId} from "../../shared/utils/auth.utils";
import {getAccountBalance, getAccountBalances,} from "../ledger/account-balance.service";

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const validated = createFinancialAccountSchema.parse(req.body);
        const account = await financialAccountService
            .createFinancialAccount(getUserId(req), validated);
        res.status(201).json({
            success: true, data: account
        });
    } catch (error) {
        next(error);
    }
};

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const accounts = await financialAccountService
            .getFinancialAccounts(getUserId(req));
        res.json({
            success: true, data: accounts
        });
    } catch (error) {
        next(error);
    }
};

export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const {id} = req.params;
        if (!id) {
            res.status(400).json({
                success: false, error: {
                    message: "Financial account id is required"
                }
            });
            return;
        }
        const validated = updateFinancialAccountSchema.parse(req.body);
        const account = await financialAccountService
            .updateFinancialAccount(getUserId(req), getParamId(id), validated);
        res.json({
            success: true,
            data: account
        });
    } catch (error) {
        next(error);
    }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const {id} = req.params;
        if (!id) {
            res.status(400).json({
                success: false, error: {
                    message: "Financial account id is required"
                }
            });
            return;
        }
        const account = await financialAccountService
            .deleteFinancialAccount(getUserId(req), getParamId(id));
        res.json({
            success: true, data: account
        });
    } catch (error) {
        next(error);
    }
};

export const archive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const {id} = req.params;
        if (!id) {
            res.status(400).json({
                success: false, error: {
                    message: "Financial account id is required"
                }
            });
            return;
        }
        const account = await financialAccountService
            .archiveFinancialAccount(getUserId(req), getParamId(id));
        res.json({
            success: true,
            data: account
        });
    } catch (error) {
        next(error);
    }
};

export const getFinancialAccountAllTransactions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const transactions = await getFinancialAccountTransactions(getUserId(req), getParamId(req.params.id));
        return res.json({
            success: true, data: transactions,
        });
    } catch (error) {
        next(error);
    }
};

export const getAccountBalanceForSingleAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const balance = await getAccountBalance(getParamId(req.params.id));
        return res.json({
            success: true, data: {balance},
        });
    } catch (error) {
        next(error);
    }
};
