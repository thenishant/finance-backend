import {NextFunction, Request, Response} from "express";
import {getUserId} from "../../../shared/utils/auth.utils";
import {syncGmailSchema} from "./gmail.dto";
import * as gmailService from "./gmail.service";

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
    next: NextFunction
) => {
    try {
        await gmailService.connectGoogleAccount({
            code: req.query.code as string,
            state: req.query.state as string,
        });

        return res.redirect(
            "finance-mobile://gmail?connected=true"
        );
    } catch {
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

        const result = await gmailService.syncMailbox(
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