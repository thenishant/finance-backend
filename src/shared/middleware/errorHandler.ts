import {NextFunction, Request, Response} from "express";

const errorHandler = (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    console.error(err);

    res.status(err.status || 500).json({
        success: false,
        error: {
            message: err.message || "Internal Server Error"
        }
    });
};

export default errorHandler;