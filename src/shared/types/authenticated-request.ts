import {Request} from "express";
import {JwtPayload} from "../../modules/auth/auth.types";

export interface AuthenticatedRequest extends Request {
    user: JwtPayload;
}