import {NextFunction, Request, Response} from 'express';

const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.error(err);

    res.status(err.status || 500).json({
        success: false,
        error: {
            message: err.message || 'Internal Server Error'
        }
    });
};

export default errorHandler;