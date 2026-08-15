import {google} from "googleapis";
import {prisma} from "../../../database/prisma";
import {processGmailMessage} from "./ingestion/transaction.ingestion";

import {createGoogleClient, generateGoogleState, GOOGLE_SCOPES, verifyGoogleState,} from "./gmail.utils";

export const disconnectGmail = async (userId: string,) => {
    await prisma.gmailAccount.deleteMany({
        where: {
            userId,
        },
    });

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

    const payload = verifyGoogleState(state);

    if (payload.purpose !== "gmail-connect") {
        throw new Error("Invalid Google authorization state");
    }

    const oauth2Client = createGoogleClient();

    const {tokens} = await oauth2Client.getToken(code);

    console.log("[Google] Tokens", {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiry: tokens.expiry_date,
    });

    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({
        version: "v1",
        auth: oauth2Client,
    });

    const profile = await gmail.users.getProfile({
        userId: "me",
    });

    const email = profile.data.emailAddress;

    if (!email) {
        throw new Error("Unable to retrieve Gmail email");
    }

    const existingAccount = await prisma.gmailAccount.findUnique({
        where: {
            userId: payload.userId,
        },
    });

    const refreshToken =
        tokens.refresh_token ?? existingAccount?.refreshToken;

    if (!refreshToken) {
        throw new Error(
            "Google did not return a refresh token. Remove the app from your Google Account permissions and connect again."
        );
    }

    const account = {
        email,
        refreshToken,
        accessToken: tokens.access_token ?? existingAccount?.accessToken ?? null,
        expiresAt: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : existingAccount?.expiresAt ?? null,
    };

    console.log("[Google] Saving account", {
        refreshToken: !!account.refreshToken,
        accessToken: !!account.accessToken,
    });

    await prisma.gmailAccount.upsert({
        where: {
            userId: payload.userId,
        },
        update: account,
        create: {
            userId: payload.userId,
            ...account,
        },
    });

    return {
        email,
    };
};

export const getGoogleUrl = async (userId: string) => {
    const state = generateGoogleState(userId);
    const client = createGoogleClient();
    const url = client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        state,
        scope: GOOGLE_SCOPES,
    });
    return {url};
};

export const getStatus = async (userId: string) => {
    const account = await prisma.gmailAccount.findUnique({
        where: {userId},
    });

    return {
        connected: !!account,
        email: account?.email ?? null,
        lastSyncAt: account?.lastSyncAt ?? null,
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