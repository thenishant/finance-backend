import {NextFunction, Request, Response} from "express";
import {google} from "googleapis";
import {prisma} from "../../../database/prisma";
import {verifyGoogleState} from "./gmail.utils";
import {syncMailbox} from "./gmail.service";
import {processGmailMessage} from "./ingestion/transaction.ingestion";
import {getUserId} from "../../../shared/utils/auth.utils";
import {syncGmailSchema} from "./gmail.dto";

export const googleCallback = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const code = req.query.code as string;
        const state = req.query.state as string;

        if (!code || !state) {
            return res.status(400).json({
                success: false, error: {
                    message: "Missing code or state"
                }
            });
        }

        const payload = verifyGoogleState(state);

        if (payload.purpose !== "gmail-connect") {
            return res.status(400).json({
                success: false,
                error: {
                    message: "Invalid Google authorization state"
                }
            });
        }

        const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);

        const {tokens} = await oauth2Client.getToken(code);

        if (!tokens.refresh_token) {
            throw new Error("Google did not return refresh token");
        }

        oauth2Client.setCredentials(tokens);

        const gmail = google.gmail({
            version: "v1", auth: oauth2Client
        });

        const profile = await gmail.users.getProfile({
            userId: "me"
        });

        const email = profile.data.emailAddress;

        if (!email) {
            throw new Error("Unable to retrieve Gmail email");
        }

        await prisma.gmailAccount.upsert({
            where: {
                userId: payload.userId
            },

            update: {
                email, refreshToken: tokens.refresh_token,

                accessToken: tokens.access_token ?? null,

                expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null
            },

            create: {
                userId: payload.userId,

                email,

                refreshToken: tokens.refresh_token,

                accessToken: tokens.access_token ?? null,

                expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null
            }
        });

        return res.json({
            success: true,
            data: {
                email
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getGmailStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false, error: {
                    message: "Unauthorized"
                }
            });
        }

        const account = await prisma.gmailAccount.findUnique({
            where: {
                userId
            }
        });

        return res.json({
            success: true, data: {
                connected: !!account, email: account?.email ?? null
            }
        });

    } catch (error) {
        next(error);
    }
};

export const syncGmail = async (req: Request, res: Response, next: NextFunction) => {
    try {

        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false, error: {
                    message: "Unauthorized"
                }
            });
        }

        const options = syncGmailSchema.parse(req.body ?? {});
        const result = await syncMailbox(userId, options);

        return res.json({
            success: true, data: result
        });

    } catch (error) {
        next(error);
    }
};


export const processExistingEmails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: {
                    message: "Unauthorized"
                }
            });
        }
        const messages = await prisma.gmailMessage.findMany({
            where: {
                processed: false, gmailAccount: {
                    userId
                }
            }
        });
        for (const message of messages) {
            try {
                await processGmailMessage(message.id);
            } catch (error) {
                console.error("FAILED", message.id, error);
            }
        }
        return res.json({
            success: true, count: messages.length
        });
    } catch (error) {
        next(error);
    }
};

export const purgeStoredEmails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = getUserId(req);
        const result = await prisma.gmailMessage.deleteMany({
            where: {
                gmailAccount: {
                    userId
                }
            }
        });

        return res.json({
            success: true,
            data: {
                deleted: result.count
            }
        });
    } catch (error) {
        next(error);
    }
};
