import {NextFunction, Request, Response} from 'express';
import {loginSchema, registerSchema} from './auth.dto';
import {loginUser, registerUser} from './auth.service';

export const register = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const validated = registerSchema.parse(req.body);

        const token = await registerUser(validated);

        res.status(201).json({
            success: true,
            data: {token}
        });
    } catch (error) {
        next(error);
    }
};

export const login = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const validated = loginSchema.parse(req.body);

        const token = await loginUser(validated);

        res.json({
            success: true,
            data: {token}
        });
    } catch (error) {
        next(error);
    }
};