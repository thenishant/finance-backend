import {prisma} from "../../../../database/prisma";
import {createGmailClient, getConnectedGmailAccount} from "../gmail.utils";

const GMAIL_TOPIC = process.env.GMAIL_PUBSUB_TOPIC!;

type GmailAccount =
    Awaited<ReturnType<typeof getConnectedGmailAccount>>;

export const startGmailWatch = async (
    gmailAccount: GmailAccount,
): Promise<void> => {

    const gmail = createGmailClient(
        gmailAccount.refreshToken,
    );

    const {data} = await gmail.users.watch({
        userId: "me",
        requestBody: {
            topicName: GMAIL_TOPIC,
        },
    });

    if (!data.historyId || !data.expiration) {
        throw new Error("Failed to start Gmail watch.");
    }

    const watchExpiresAt = new Date(
        Number(data.expiration),
    );

    /*
     * gmail.users.watch() always returns the mailbox's CURRENT
     * historyId - not the historyId "as of last sync". Blindly
     * writing it here would silently jump the sync checkpoint
     * forward past anything that happened before this call (e.g.
     * while the account was disconnected, or simply between the
     * last sync and this watch renewal) - exactly what incremental
     * sync exists to catch. So this only initializes historyId the
     * first time (a brand-new account, or one where a full backfill
     * already reset it) - a reconnect or a routine watch renewal on
     * an account that already has a checkpoint leaves it alone.
     */
    await prisma.gmailAccount.update({
        where: {
            id: gmailAccount.id,
        },
        data: {
            watchExpiresAt,

            ...(gmailAccount.historyId
                ? {}
                : {
                    historyId:
                    data.historyId,
                }),
        },
    });

    console.info("[Gmail] Watch started", {
        email: gmailAccount.email,
        historyId:
            gmailAccount.historyId ??
            data.historyId,
        preservedExistingHistoryId: Boolean(gmailAccount.historyId),
        expiresAt: watchExpiresAt,
    });

};