import {NextFunction, Request, Response} from "express";
import {getUserId} from "../../../shared/utils/auth.utils";
import {syncGmailSchema} from "./gmail.dto";
import * as gmailService from "./gmail.service";
import {syncMailbox} from "./gmail.sync";
import {createGmailClient} from "./gmail.utils";
import {prisma} from "../../../database/prisma";

export const getGoogleUrl = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const result = await gmailService.getGoogleUrl(getUserId(req));

        return res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const googleCallback = async (
    req: Request,
    res: Response,
) => {
    try {
        await gmailService.connectGoogleAccount({
            code: req.query.code as string,
            state: req.query.state as string,
        });

        return res.redirect(
            "finance-mobile://gmail?connected=true"
        );
    } catch (error) {
        console.error("GOOGLE CALLBACK ERROR:", error);

        return res.redirect(
            "finance-mobile://gmail?connected=false"
        );
    }
};

export const getGmailStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const result = await gmailService.getStatus(getUserId(req));

        return res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const syncGmail = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const options = syncGmailSchema.parse(req.body ?? {});

        const result = await syncMailbox(
            getUserId(req),
            options
        );

        return res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const processExistingEmails = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const result = await gmailService.processExistingEmails(
            getUserId(req)
        );

        return res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const purgeStoredEmails = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const result = await gmailService.purgeStoredEmails(
            getUserId(req)
        );

        return res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const startWatch = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {

    try {

        await gmailService.startWatch(
            getUserId(req),
        );

        res.json({
            success: true,
        });

    } catch (error) {
        next(error);
    }

};

export const disconnectGmail = async (userId: string) => {
    const account =
        await prisma.gmailAccount.findUnique({
            where: {
                userId,
            },
        });

    if (!account) {
        return {
            disconnected: true,
        };
    }

    try {
        const gmail = createGmailClient(account.refreshToken);
        await gmail.users.stop({userId: "me"});
        console.info("[Gmail] Watch stopped", {email: account.email,});

    } catch (error) {
        console.warn("[Gmail] Failed to stop watch", error);
    }

    await prisma.gmailAccount.delete({
        where: {
            id: account.id,
        },
    });

    return {
        disconnected: true,
    };

};

export const getRecentImports = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {

    try {

        const result =
            await gmailService.getRecentImports(
                getUserId(req),
            );

        res.json({
            success: true,
            data: result,
        });

    } catch (error) {

        next(error);

    }

};