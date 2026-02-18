import {NextFunction, Request, Response} from 'express';
import jwt from 'jsonwebtoken';
import {JwtPayload} from '../../modules/auth/auth.types';

const JWT_SECRET = process.env.JWT_SECRET as string;

export interface AuthRequest extends Request {
    user?: JwtPayload;
}

export const authenticate = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const header = req.headers.authorization;

        if (!header || Array.isArray(header)) {
            return res.status(401).json({
                success: false,
                error: {message: 'Unauthorized'}
            });
        }

        if (!header.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: {message: 'Unauthorized'}
            });
        }

        const token = header.split(' ')[1];

        req.user = jwt.verify(token, JWT_SECRET) as JwtPayload;

        next();
    } catch {
        res.status(401).json({
            success: false,
            error: {message: 'Unauthorized'}
        });
    }
};