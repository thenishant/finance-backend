import {prisma} from "../../../../database/prisma";
import {syncMailbox} from "../gmail.sync";

interface PubSubEnvelope {
    message?: {
        data?: string;
        messageId?: string;
    };
}

interface GmailNotification {
    emailAddress: string;
    historyId: string;
}

export const handleGmailWebhook = async (
    payload: PubSubEnvelope,
): Promise<void> => {

    const encoded = payload.message?.data;

    if (!encoded) {
        console.warn("[Webhook] Missing Pub/Sub data");
        return;
    }

    let notification: GmailNotification;

    try {
        notification = JSON.parse(
            Buffer.from(encoded, "base64").toString("utf8"),
        );
    } catch (error) {
        console.error("[Webhook] Invalid payload", error);
        return;
    }

    if (!notification.emailAddress) {
        console.warn("[Webhook] Missing emailAddress");
        return;
    }

    console.info("[Webhook] Notification", notification);

    const gmailAccount =
        await prisma.gmailAccount.findUnique({
            where: {
                email: notification.emailAddress,
            },
        });

    if (!gmailAccount) {
        console.warn(
            "[Webhook] Gmail account not found",
            notification.emailAddress,
        );
        return;
    }

    syncMailbox(gmailAccount.userId)
        .then(stats => {
            console.info(
                "[Webhook] Sync completed",
                stats,
            );
        })
        .catch(error => {
            console.error(
                "[Webhook] Sync failed",
                error,
            );
        });
};