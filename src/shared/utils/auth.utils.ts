import {Request} from "express";

export const getUserId = (req: Request): string => {
    if (!req.user) {
        throw {
            status: 401, message: "Unauthorized"
        };
    }
    return req.user.userId;
};


export const getParamId = (value: string | string[] | undefined): string => {
    if (!value || Array.isArray(value)) {
        throw new Error("Invalid id");
    }
    return value;
};