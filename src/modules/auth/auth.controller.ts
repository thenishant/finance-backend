import {NextFunction, Request, Response} from 'express';
import {loginSchema, registerSchema} from './auth.dto';
import {loginUser, registerUser} from './auth.service';
import {verifySupabaseToken} from "./supabase.service";
import {prisma} from "../../database/prisma";
import {AuthProvider} from "@prisma/client";
import jwt from "jsonwebtoken";
import {google} from "googleapis";
import {generateGoogleState} from "../email/gmail/gmail.utils";

export const register = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const validated = registerSchema.parse(req.body);
        const token = await registerUser(validated);

        res.status(201).json({
            success: true, data: {token}
        });
    } catch (error) {
        next(error);
    }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const validated = loginSchema.parse(req.body);
        const token = await loginUser(validated);

        res.json({
            success: true, data: {token}
        });
    } catch (error) {
        next(error);
    }
};

export const logout = async (_req: Request, res: Response) => {
    res.json({
        success: true, message: "Logged out successfully"
    });
};

export const googleLogin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const decoded: any = await verifySupabaseToken(req.body.supabaseToken);
        const email = decoded.email;
        if (!email) {
            throw new Error("No email in Supabase token");
        }

        let user = await prisma.user.findUnique({
            where: {email},
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    email, authProvider: AuthProvider.GOOGLE,
                },
            });
        }

        const appToken = jwt.sign({userId: user.id}, process.env.JWT_SECRET!, {expiresIn: "7d"});

        res.json({
            success: true, data: {token: appToken},
        });

    } catch (error) {
        console.error("Google login error:", error);
        next(error);
    }
};

export const getGoogleUrl = async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(401).json({
            success: false, error: {
                message: "Unauthorized"
            }
        });
    }

    const state = generateGoogleState(userId);

    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);

    const url = oauth2Client.generateAuthUrl({
        access_type: "offline", prompt: "consent", state,

        scope: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly"]
    });

    return res.json({
        success: true, data: {url}
    });
};