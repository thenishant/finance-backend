import {google} from "googleapis";
import {prisma} from "../../../database/prisma";
import {processGmailMessage} from "./ingestion/transaction.ingestion";

import {
    createGoogleClient,
    generateGoogleState,
    getConnectedGmailAccount,
    GOOGLE_SCOPES,
    verifyGoogleState,
} from "./gmail.utils";
import {startGmailWatch} from "./watch/watch.service";
import {RecentImportDTO} from "./gmail.dto";

export const getRecentImports = async (
    userId: string,
): Promise<RecentImportDTO[]> => {

    const transactions =
        await prisma.transaction.findMany({

            where: {
                userId,
                source: "GMAIL",
            },

            include: {
                merchant: true,
                category: true,
            },

            orderBy: {
                date: "desc",
            },

            take: 5,

        });

    return transactions.map(transaction => ({

        id: transaction.id,

        merchant:
            transaction.merchant?.name ??
            transaction.merchantRaw ??
            "Unknown Merchant",

        category:
            transaction.category?.name ??
            null,

        amount:
            Number(transaction.amount),

        date:
            transaction.date.toISOString(),

    }));

};

export const disconnectGmail = async (
    userId: string,
) => {

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

        const client =
            createGoogleClient();

        client.setCredentials({
            refresh_token:
            account.refreshToken,
        });

        const gmail =
            google.gmail({
                version: "v1",
                auth: client,
            });

        await gmail.users.stop({
            userId: "me",
        });

        console.info(
            "[Gmail] Watch stopped",
            {
                email: account.email,
            },
        );

    } catch (error: any) {

        console.warn(
            "[Gmail] Failed to stop Gmail watch",
            {
                email: account.email,
                message: error?.message,
            },
        );

    }

    await prisma.gmailAccount.delete({
        where: {
            id: account.id,
        },
    });

    console.info(
        "[Gmail] Gmail disconnected",
        {
            email: account.email,
        },
    );

    return {
        disconnected: true,
    };

};

export const connectGoogleAccount = async ({
                                               code,
                                               state,
                                           }: {
    code: string;
    state: string;
}) => {

    if (!code || !state) {
        throw new Error("Missing code or state");
    }

    const payload =
        verifyGoogleState(state);

    if (payload.purpose !== "gmail-connect") {
        throw new Error(
            "Invalid Google authorization state",
        );
    }

    const oauth2Client =
        createGoogleClient();

    const {tokens} =
        await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    const gmail =
        google.gmail({
            version: "v1",
            auth: oauth2Client,
        });

    const profile =
        await gmail.users.getProfile({
            userId: "me",
        });

    const email =
        profile.data.emailAddress;

    if (!email) {
        throw new Error(
            "Unable to retrieve Gmail email.",
        );
    }

    const existingAccount =
        await prisma.gmailAccount.findUnique({
            where: {
                userId: payload.userId,
            },
        });

    const refreshToken =
        tokens.refresh_token ??
        existingAccount?.refreshToken;

    if (!refreshToken) {
        throw new Error(
            "Google did not return a refresh token. Remove this app from your Google Account permissions and connect again.",
        );
    }

    const gmailAccount =
        await prisma.gmailAccount.upsert({
            where: {
                userId: payload.userId,
            },
            update: {
                email,
                refreshToken,
            },
            create: {
                userId: payload.userId,
                email,
                refreshToken,
            },
        });

    await startGmailWatch(
        gmailAccount,
    );

    console.info(
        existingAccount
            ? "[Google] Gmail reconnected"
            : "[Google] Gmail connected",
        {
            userId: payload.userId,
            email,
        },
    );

    return {
        email,
    };

};

export const getGoogleUrl = async (
    userId: string,
) => {

    const state =
        generateGoogleState(userId);

    const client =
        createGoogleClient();

    return {
        url: client.generateAuthUrl({
            access_type: "offline",
            prompt: "consent",
            state,
            scope: GOOGLE_SCOPES,
        }),
    };
};

export const getStatus = async (
    userId: string,
) => {

    const account =
        await prisma.gmailAccount.findUnique({
            where: {
                userId,
            },
        });

    if (
        !account ||
        !account.refreshToken
    ) {
        return {
            connected: false,
            email: null,
            lastSyncAt: null,
            watchExpiresAt: null,
            watchActive: false,
            watchStatus: "EXPIRED" as const,
            autoImportEnabled: false,
        };
    }

    const now =
        new Date();

    const watchActive =
        account.watchExpiresAt != null &&
        account.watchExpiresAt > now;

    return {
        connected: true,
        email: account.email,
        lastSyncAt: account.lastSyncAt,
        watchExpiresAt:
        account.watchExpiresAt,
        watchActive,
        watchStatus:
            watchActive
                ? "ACTIVE"
                : "EXPIRED",
        autoImportEnabled: true,
    };

};

export const processExistingEmails = async (userId: string) => {
    const messages = await prisma.gmailMessage.findMany({
        where: {
            processed: false,
            gmailAccount: {
                userId,
            },
        },
    });

    for (const message of messages) {
        try {
            await processGmailMessage(message.id);
        } catch (error) {
            console.error("FAILED", message.id, error);
        }
    }

    return {
        count: messages.length,
    };
};

export const purgeStoredEmails = async (userId: string) => {
    const result = await prisma.gmailMessage.deleteMany({
        where: {
            gmailAccount: {
                userId,
            },
        },
    });

    return {
        deleted: result.count,
    };
};

export const startWatch = async (
    userId: string,
) => {

    const account =
        await getConnectedGmailAccount(userId);

    await startGmailWatch(account);
};