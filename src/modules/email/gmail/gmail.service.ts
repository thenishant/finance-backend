import {gmail_v1, google} from "googleapis";
import {prisma} from "../../../database/prisma";
import {ingestGmailEmail, processGmailMessage} from "./ingestion/transaction.ingestion";
import {cleanEmailBody} from "./utils/body-cleaner";
import {SyncGmailDTO} from "./gmail.dto";
import {Credentials} from "google-auth-library";

import {
    createGmailClient,
    createGoogleClient,
    generateGoogleState,
    getConnectedGmailAccount,
    GMAIL_QUERY,
    GOOGLE_SCOPES,
    verifyGoogleState,
} from "./gmail.utils";

const decodeBase64 = (input?: string | null): string => {
    if (!input) {
        return "";
    }

    return Buffer.from(
        input.replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
    ).toString("utf8");
};

const extractBody = (
    payload?: gmail_v1.Schema$MessagePart | null
): string => {
    if (!payload) {
        return "";
    }

    if (payload.body?.data) {
        return decodeBase64(payload.body.data);
    }

    const parts = payload.parts ?? [];

    for (const part of parts) {
        if (part.mimeType === "text/plain") {
            return decodeBase64(part.body?.data);
        }
    }

    for (const part of parts) {
        const body = extractBody(part);

        if (body) {
            return body;
        }
    }

    for (const part of parts) {
        if (part.mimeType === "text/html") {
            return decodeBase64(part.body?.data);
        }
    }

    return "";
};

const gmailAccountData = (
    email: string,
    tokens: Credentials
) => ({
    email,
    refreshToken: tokens.refresh_token!,
    accessToken: tokens.access_token ?? null,
    expiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
});

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

    if (!tokens.refresh_token) {
        throw new Error("Google did not return refresh token");
    }

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

    const account = gmailAccountData(
        email,
        tokens
    );

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

const getHeader = (
    headers: gmail_v1.Schema$MessagePartHeader[] = [],
    name: string
) =>
    headers.find(
        h => h.name?.toLowerCase() === name.toLowerCase()
    )?.value ?? null;

const processMessage = async (
    gmail: gmail_v1.Gmail,
    userId: string,
    messageId: string
) => {
    const detail = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
    });
    const payload = detail.data.payload;
    const headers = payload?.headers ?? [];
    const sender = getHeader(headers, "from");
    const subject = getHeader(headers, "subject");

    const body = cleanEmailBody(
        extractBody(payload)
    );

    const receivedAt = detail.data.internalDate
        ? new Date(Number(detail.data.internalDate))
        : null;

    return ingestGmailEmail({
        userId,
        gmailMessageId: messageId,
        sender,
        subject,
        body,
        receivedAt,
    });
};

export const syncMailbox = async (
    userId: string,
    options: SyncGmailDTO = {}
) => {
    const gmailAccount = await getConnectedGmailAccount(userId);

    const gmail = createGmailClient(gmailAccount.refreshToken);

    const listResponse = await gmail.users.messages.list({
        userId: "me",
        q: GMAIL_QUERY,
        maxResults: options.maxResults ?? 1,
        pageToken: options.pageToken,
    });

    const messages = listResponse.data.messages ?? [];

    const results = await Promise.all(
        messages
            .filter(
                (
                    message
                ): message is gmail_v1.Schema$Message & { id: string } =>
                    !!message.id
            )
            .map(message =>
                processMessage(
                    gmail,
                    userId,
                    message.id
                )
            )
    );

    const transactionsCreated = results.filter(
        result => result.status === "created"
    ).length;

    const duplicates = results.filter(
        result => result.status === "duplicate"
    ).length;

    await prisma.gmailAccount.update({
        where: {
            id: gmailAccount.id,
        },
        data: {
            lastSyncAt: new Date(),
        },
    });

    return {
        fetched: messages.length,
        transactionsCreated,
        duplicates,
        query: GMAIL_QUERY,
        maxResults: options.maxResults ?? 1,
        nextPageToken: listResponse.data.nextPageToken ?? null,
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
    return { url };
};

export const getStatus = async (userId: string) => {
    const account = await prisma.gmailAccount.findUnique({
        where: {userId},
    });

    return {
        connected: !!account,
        email: account?.email ?? null,
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