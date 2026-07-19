import {google} from "googleapis";
import {prisma} from "../../../database/prisma";
import {ingestGmailEmail} from "./ingestion/transaction.ingestion";
import {cleanEmailBody} from "./utils/body-cleaner";
import {SyncGmailDTO} from "./gmail.dto";

const decodeBase64 = (input?: string | null): string => {

    if (!input) {
        return "";
    }

    return Buffer.from(input
        .replace(/-/g, "+")
        .replace(/_/g, "/"), "base64").toString("utf8");
};

const extractBody = (payload: any): string => {

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

export const syncMailbox = async (userId: string, options: SyncGmailDTO = {}) => {

    const gmailAccount = await prisma.gmailAccount.findUnique({
        where: {
            userId
        }
    });

    if (!gmailAccount) {
        throw new Error("Gmail account not connected");
    }

    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);

    oauth2Client.setCredentials({
        refresh_token: gmailAccount.refreshToken
    });

    const gmail = google.gmail({
        version: "v1", auth: oauth2Client
    });

    const listResponse = await gmail.users.messages.list({
        userId: "me",
        q: "from:alerts@axis.bank.in newer_than:30d",
        maxResults: options.maxResults ?? 1,
        pageToken: options.pageToken
    });

    const messages = listResponse.data.messages ?? [];

    let transactionsCreated = 0;
    let duplicates = 0;

    for (const message of messages) {

        const detail = await gmail.users.messages.get({
            userId: "me", id: message.id!
        });

        const payload = detail.data.payload;

        const headers = payload?.headers ?? [];

        const sender = headers.find(h => h.name?.toLowerCase() === "from")?.value ?? null;

        const subject = headers.find(h => h.name?.toLowerCase() === "subject")?.value ?? null;

        const body = cleanEmailBody(extractBody(payload));

        const receivedAt = detail.data.internalDate
            ? new Date(Number(detail.data.internalDate))
            : null;

        const result = await ingestGmailEmail({
            userId,
            gmailMessageId: message.id!,
            sender,
            subject,
            body,
            receivedAt
        });

        if (result.status === "created") {
            transactionsCreated++;
        } else if (result.status === "duplicate") {
            duplicates++;
        }
    }

    await prisma.gmailAccount.update({
        where: {
            id: gmailAccount.id
        }, data: {
            lastSyncAt: new Date()
        }
    });

    return {
        fetched: messages.length,
        transactionsCreated,
        duplicates,
        query: "from:alerts@axis.bank.in newer_than:30d",
        maxResults: options.maxResults ?? 1,
        nextPageToken: listResponse.data.nextPageToken ?? null
    };
};
