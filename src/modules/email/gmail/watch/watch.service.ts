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

    await prisma.gmailAccount.update({
        where: {
            id: gmailAccount.id,
        },
        data: {
            historyId: data.historyId,
            watchExpiresAt,
        },
    });

    console.info("[Gmail] Watch started", {
        email: gmailAccount.email,
        historyId: data.historyId,
        expiresAt: watchExpiresAt,
    });

};