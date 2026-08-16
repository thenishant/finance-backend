import {Request, Response} from "express";
import {handleGmailWebhook} from "./webhook.service";

export const gmailWebhook = async (
    req: Request,
    res: Response,
): Promise<void> => {
    res.sendStatus(200);
    void handleGmailWebhook(req.body).catch(error => {
        console.error("[Webhook] Processing failed", error);
    });
};