import {gmail_v1} from "googleapis";

import {prisma} from "../../../database/prisma";
import {ingestGmailEmail} from "./ingestion/transaction.ingestion";
import {createGmailClient, getConnectedGmailAccount, GMAIL_QUERY,} from "./gmail.utils";
import {SyncGmailDTO} from "./gmail.dto";
import {cleanEmailBody} from "./utils/body-cleaner";

export interface GmailSyncStats {
    fetched: number;
    transactionsCreated: number;
    duplicates: number;
    skipped: number;
    nextPageToken: string | null;
    lastSyncAt: Date;
}

const activeSyncs = new Set<string>();

const processMessage = async (
    gmail: gmail_v1.Gmail,
    userId: string,
    messageId: string,
): Promise<ProcessResult> => {

    const detail =
        await gmail.users.messages.get({
            userId: "me",
            id: messageId,
        });

    const payload =
        detail.data.payload;

    const headers =
        payload?.headers ?? [];

    return ingestGmailEmail({
        userId,
        gmailMessageId: messageId,
        sender: getHeader(headers, "from"),
        subject: getHeader(headers, "subject"),
        body: cleanEmailBody(
            extractBody(payload),
        ),
        receivedAt:
            detail.data.internalDate ? new Date(Number(detail.data.internalDate)) : null,
    });

};

const decodeBase64 = (
    input?: string | null,
): string => {

    if (!input) {
        return "";
    }

    return Buffer.from(
        input
            .replace(/-/g, "+")
            .replace(/_/g, "/"),
        "base64",
    ).toString("utf8");
};

const extractBody = (
    payload?: gmail_v1.Schema$MessagePart | null,
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

const getHeader = (
    headers: gmail_v1.Schema$MessagePartHeader[] = [],
    name: string,
): string | null =>
    headers.find(
        h =>
            h.name?.toLowerCase() ===
            name.toLowerCase(),
    )?.value ?? null;

const getSyncStats = (
    results: ProcessResult[],
) => {

    const stats = {
        transactionsCreated: 0,
        duplicates: 0,
        skipped: 0,
    };

    for (const result of results) {

        switch (result.status) {

            case "created":
                stats.transactionsCreated++;
                break;

            case "duplicate":
                stats.duplicates++;
                break;

            default:
                stats.skipped++;
        }

    }

    return stats;

};


const saveCheckpoint = async (
    gmailAccountId: string,
    historyId: string,
): Promise<Date> => {

    const lastSyncAt =
        new Date();

    await prisma.gmailAccount.update({
        where: {
            id: gmailAccountId,
        },
        data: {
            historyId,
            lastSyncAt,
        },
    });

    return lastSyncAt;

};

class GmailHistoryExpiredError extends Error {
    constructor() {
        super("Gmail history expired");
    }
}

type GmailAccount =
    Awaited<ReturnType<typeof getConnectedGmailAccount>>;

type ProcessResult =
    Awaited<ReturnType<typeof ingestGmailEmail>>;


export const performInitialSync = async (
    gmail: gmail_v1.Gmail,
    gmailAccount: GmailAccount,
    userId: string,
    options: SyncGmailDTO,
): Promise<GmailSyncStats> => {

    let response: gmail_v1.Schema$ListMessagesResponse;

    try {
        response = (
            await gmail.users.messages.list({
                userId: "me",
                q: GMAIL_QUERY,
                maxResults: options.maxResults ?? 50,
                pageToken: options.pageToken,
            })
        ).data;
    } catch (error: any) {
        console.error("[Gmail] Initial sync failed", {
            message: error.message,
            code: error.code,
            response: error.response?.data,
        });

        throw error;
    }

    const messages = (response.messages ?? []).filter(
        (
            message,
        ): message is gmail_v1.Schema$Message & {
            id: string;
        } => Boolean(message.id),
    );

    const results: ProcessResult[] = [];

    for (const [index, message] of messages.entries()) {

        console.info(
            `[Initial ${index + 1}/${messages.length}] ${message.id}`,
        );

        try {
            results.push(
                await processMessage(
                    gmail,
                    userId,
                    message.id,
                ),
            );
        } catch (error) {
            console.error(
                `[Initial] Failed ${message.id}`,
                error,
            );
        }
    }

    //
    // Messages API does not return historyId.
    //
    const profile = await gmail.users.getProfile({
        userId: "me",
    });

    const historyId = profile.data.historyId;

    if (!historyId) {
        throw new Error(
            "Unable to determine Gmail historyId.",
        );
    }

    const lastSyncAt = await saveCheckpoint(
        gmailAccount.id,
        historyId,
    );

    return {
        fetched: messages.length,
        nextPageToken: response.nextPageToken ?? null,
        lastSyncAt,
        ...getSyncStats(results),
    };
};

export const performIncrementalSync = async (
    gmail: gmail_v1.Gmail,
    gmailAccount: GmailAccount,
    userId: string,
): Promise<GmailSyncStats> => {

    if (!gmailAccount.historyId) {
        throw new GmailHistoryExpiredError();
    }

    const messageIds = new Set<string>();

    let latestHistoryId = gmailAccount.historyId;
    let pageToken: string | undefined;

    try {

        do {

            const response = (
                await gmail.users.history.list({
                    userId: "me",
                    startHistoryId: gmailAccount.historyId,
                    historyTypes: ["messageAdded"],
                    pageToken,
                })
            ).data;

            latestHistoryId =
                response.historyId ??
                latestHistoryId;

            for (const history of response.history ?? []) {

                for (const added of history.messagesAdded ?? []) {

                    if (added.message?.id) {
                        messageIds.add(
                            added.message.id,
                        );
                    }

                }

            }

            pageToken =
                response.nextPageToken ??
                undefined;

        } while (pageToken);

    } catch (error: any) {

        if (
            error.code === 404 ||
            error.response?.status === 404
        ) {
            throw new GmailHistoryExpiredError();
        }

        throw error;
    }

    console.info("[Gmail] Incremental sync", {
        previousHistoryId: gmailAccount.historyId,
        latestHistoryId,
        newMessages: messageIds.size,
    });

    const results: ProcessResult[] = [];

    let index = 0;

    for (const messageId of messageIds) {

        index++;

        console.info(
            `[Incremental ${index}/${messageIds.size}] ${messageId}`,
        );

        try {

            results.push(
                await processMessage(
                    gmail,
                    userId,
                    messageId,
                ),
            );

        } catch (error) {

            console.error(
                `[Incremental] Failed ${messageId}`,
                error,
            );

        }

    }

    const lastSyncAt =
        await saveCheckpoint(
            gmailAccount.id,
            latestHistoryId,
        );

    return {
        fetched: messageIds.size,
        nextPageToken: null,
        lastSyncAt,
        ...getSyncStats(results),
    };
};

export const syncMailbox = async (
    userId: string,
    options: SyncGmailDTO = {},
): Promise<GmailSyncStats> => {

    if (activeSyncs.has(userId)) {

        console.info("[Gmail] Sync already running", {
            userId,
        });

        return {
            fetched: 0,
            transactionsCreated: 0,
            duplicates: 0,
            skipped: 0,
            nextPageToken: null,
            lastSyncAt: new Date(),
        };

    }

    activeSyncs.add(userId);

    try {

        const gmailAccount =
            await getConnectedGmailAccount(userId);

        console.info("[Gmail] Sync", {
            email: gmailAccount.email,
            historyId: gmailAccount.historyId,
        });

        const gmail = createGmailClient(
            gmailAccount.refreshToken,
        );

        try {

            if (gmailAccount.historyId) {

                return await performIncrementalSync(
                    gmail,
                    gmailAccount,
                    userId,
                );

            }

            return await performInitialSync(
                gmail,
                gmailAccount,
                userId,
                options,
            );

        } catch (error) {

            if (
                error instanceof GmailHistoryExpiredError
            ) {

                console.warn(
                    "[Gmail] History expired. Running initial sync.",
                );

                return await performInitialSync(
                    gmail,
                    gmailAccount,
                    userId,
                    options,
                );

            }

            throw error;

        }

    } finally {

        activeSyncs.delete(userId);

    }

};