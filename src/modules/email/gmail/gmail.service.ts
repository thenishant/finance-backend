import {google} from "googleapis";
import {prisma} from "../../../database/prisma";

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

    /*
     * Soft-disconnect: the row (and critically, historyId/
     * lastSyncAt) is kept rather than deleted. needsReconnect
     * blocks the stale refreshToken from being used for anything
     * until the user reconnects - but when they do, connectGoogleAccount
     * reuses this same row, so the very next sync is an exact
     * `history.list(startHistoryId)` catch-up covering everything
     * that arrived while disconnected, instead of an approximate,
     * date-filtered re-scan that can miss things (a narrow sender
     * list, day-granularity date search, clock skew, ...).
     *
     * If the gap turns out to be long enough that Gmail has
     * expired that history (roughly a week or more), the existing
     * GmailHistoryExpiredError handling in executeSyncMailbox
     * already falls back to a full backfill automatically - this
     * just makes the precise path the first thing tried, always.
     */
    await prisma.gmailAccount.update({
        where: {
            id: account.id,
        },
        data: {
            needsReconnect: true,
            reconnectReason: "user_disconnected",
            watchExpiresAt: null,
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
                needsReconnect: false,
                reconnectReason: null,
            },
            create: {
                userId: payload.userId,
                email,
                refreshToken,
            },
        });

    try {
        await startGmailWatch(
            gmailAccount,
        );
    } catch (error) {
        /*
         * The account is already connected and usable (manual
         * /sync and the watch-renewal cron both still work). Do
         * not fail the whole OAuth callback over a push-watch
         * hiccup - that would tell the user "connection failed"
         * while a valid, working GmailAccount already exists,
         * which is more confusing than a delayed watch.
         *
         * watchExpiresAt is left null here, and the renewal cron
         * (gmail-watch.job.ts) treats null the same as "expiring
         * now", so it will retry this automatically.
         */
        console.error(
            "[Gmail] Failed to start watch during connect; will retry via renewal job",
            {
                userId: payload.userId,
                email,
                message:
                    error instanceof Error
                        ? error.message
                        : String(error),
            },
        );
    }

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
    const account = await prisma.gmailAccount.findUnique({
        where: {
            userId,
        }
    });

    if (
        account?.refreshToken &&
        account.email &&
        !account.needsReconnect
    ) {
        return {
            connected: true,
            email: account.email,
        };
    }

    const state = generateGoogleState(userId);
    const client = createGoogleClient();
    return {
        connected: false,
        needsReconnect: account?.needsReconnect ?? false,
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
            needsReconnect: false,
            reconnectReason: null,
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
        !account.needsReconnect &&
        account.watchExpiresAt != null &&
        account.watchExpiresAt > now;

    return {
        connected: !account.needsReconnect,
        needsReconnect: account.needsReconnect,
        reconnectReason: account.reconnectReason,
        email: account.email,
        lastSyncAt: account.lastSyncAt,
        watchExpiresAt:
        account.watchExpiresAt,
        watchActive,
        watchStatus:
            account.needsReconnect
                ? "RECONNECT_REQUIRED"
                : watchActive
                    ? "ACTIVE"
                    : "EXPIRED",
        autoImportEnabled: !account.needsReconnect,
    };

};

export const startWatch = async (
    userId: string,
) => {

    const account =
        await getConnectedGmailAccount(userId);

    await startGmailWatch(account);
};