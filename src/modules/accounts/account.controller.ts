import {NextFunction, Response} from 'express';
import {createAccountSchema} from './account.dto';
import * as accountService from './account.service';
import {AuthRequest} from '../../shared/middleware/auth.middleware';

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const validated = createAccountSchema.parse(req.body);

        const account = await accountService.createAccount(
            req.user!.userId,
            validated
        );

        res.status(201).json({
            success: true,
            data: account
        });
    } catch (error) {
        next(error);
    }
};

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const accounts = await accountService.getAccounts(req.user!.userId);

        res.json({
            success: true,
            data: accounts
        });
    } catch (error) {
        next(error);
    }
};

export const remove = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id;

        if (!id || Array.isArray(id)) {
            return res.status(400).json({
                success: false,
                error: {message: 'Invalid account id'}
            });
        }

        await accountService.deleteAccount(req.user!.userId, id);

        res.json({success: true});
    } catch (error) {
        next(error);
    }
};