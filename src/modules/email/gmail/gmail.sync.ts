import {gmail_v1} from "googleapis";

import {prisma} from "../../../database/prisma";
import {ingestGmailEmail} from "./ingestion/transaction.ingestion";
import {createGmailClient, getConnectedGmailAccount, GMAIL_QUERY,} from "./gmail.utils";
import {SyncGmailDTO} from "./gmail.dto";
import {cleanEmailBody} from "./utils/body-cleaner";
import {GmailReconnectRequiredError} from "../../../error/GmailReconnectRequiredError";

export interface GmailSyncStats {
    fetched: number;
    transactionsCreated: number;
    duplicates: number;
    skipped: number;
    nextPageToken: string | null;
    lastSyncAt: Date;
}

type GmailAccount = Awaited<
    ReturnType<typeof getConnectedGmailAccount>
>;

type IngestionResult = Awaited<
    ReturnType<typeof ingestGmailEmail>
>;

const activeSyncs = new Map<string, Promise<GmailSyncStats>>();

class GmailHistoryExpiredError extends Error {
    constructor() {
        super("Gmail history expired");
        this.name = "GmailHistoryExpiredError";
    }
}

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

const getErrorStatus = (error: unknown): number | undefined => {
    if (!error || typeof error !== "object") {
        return undefined;
    }

    const candidate = error as {
        code?: unknown;
        response?: {
            status?: unknown;
        };
    };

    if (typeof candidate.code === "number") {
        return candidate.code;
    }

    return typeof candidate.response?.status === "number"
        ? candidate.response.status
        : undefined;
};

const getErrorMessage = (error: unknown): string => {
    if (!error || typeof error !== "object") {
        return "";
    }

    const message = (error as { message?: unknown }).message;

    return typeof message === "string" ? message.toLowerCase() : "";
};

const getErrorReason = (error: unknown): string => {
    if (!error || typeof error !== "object") {
        return "";
    }

    const response = (
        error as {
            response?: {
                data?: {
                    error?: unknown;
                };
            };
        }
    ).response;

    return typeof response?.data?.error === "string"
        ? response.data.error.toLowerCase()
        : "";
};

const isAuthorizationError = (error: unknown): boolean => {
    const status = getErrorStatus(error);
    const message = getErrorMessage(error);
    const reason = getErrorReason(error);

    return (
        status === 401 ||
        status === 403 ||
        message.includes("invalid_grant") ||
        message.includes("invalid_token") ||
        reason.includes("invalid_grant") ||
        reason.includes("invalid_token") ||
        reason.includes("unauthorized_client")
    );
};

const retry = async <T>(
    operation: () => Promise<T>,
    description: string,
    attempts = 3,
): Promise<T> => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            const status = getErrorStatus(error);

            if (
                status === 401 ||
                status === 403 ||
                (status !== undefined && status >= 400 && status < 500)
            ) {
                throw error;
            }

            console.warn(
                `[Retry ${attempt}/${attempts}] ${description}`,
                {
                    status,
                    message: getErrorMessage(error),
                },
            );

            if (attempt < attempts) {
                await sleep(attempt * 500);
            }
        }
    }

    throw lastError;
};

const decodeBase64 = (input?: string | null): string => {
    if (!input) {
        return "";
    }

    return Buffer.from(
        input.replace(/-/g, "+").replace(/_/g, "/"),
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

    const plainTextPart = parts.find(
        (part) => part.mimeType === "text/plain",
    );

    if (plainTextPart) {
        const body = extractBody(plainTextPart);

        if (body) {
            return body;
        }
    }

    for (const part of parts) {
        const body = extractBody(part);

        if (body) {
            return body;
        }
    }

    const htmlPart = parts.find(
        (part) => part.mimeType === "text/html",
    );

    return htmlPart ? decodeBase64(htmlPart.body?.data) : "";
};

const getHeader = (
    headers: gmail_v1.Schema$MessagePartHeader[] = [],
    name: string,
): string | null =>
    headers.find(
        (header) => header.name?.toLowerCase() === name.toLowerCase(),
    )?.value ?? null;

const saveCheckpoint = async (
    gmailAccountId: string,
    historyId: string,
): Promise<Date> => {
    const lastSyncAt = new Date();

    await prisma.gmailAccount.update({
        where: {id: gmailAccountId},
        data: {
            historyId,
            lastSyncAt,
        },
    });

    return lastSyncAt;
};

const handleAuthorizationError = async (
    gmailAccount: GmailAccount,
    error: unknown,
): Promise<never> => {
    if (!isAuthorizationError(error)) {
        throw error;
    }

    console.error("[Google] Gmail authorization revoked", {
        email: gmailAccount.email,
    });

    await prisma.gmailAccount.delete({
        where: {id: gmailAccount.id},
    });

    throw new GmailReconnectRequiredError();
};

export const processMessage = async (
    gmail: gmail_v1.Gmail,
    userId: string,
    messageId: string,
): Promise<IngestionResult> => {
    const detail = await retry(
        () =>
            gmail.users.messages.get({
                userId: "me",
                id: messageId,
            }),
        `Fetch Gmail message ${messageId}`,
    );

    const payload = detail.data.payload;
    const headers = payload?.headers ?? [];

    return ingestGmailEmail({
        userId,
        gmailMessageId: messageId,
        sender: getHeader(headers, "from"),
        subject: getHeader(headers, "subject"),
        body: cleanEmailBody(extractBody(payload)),
        receivedAt: detail.data.internalDate
            ? new Date(Number(detail.data.internalDate))
            : null,
    });
};

const processMessages = async (
    gmail: gmail_v1.Gmail,
    userId: string,
    messages: { id: string }[],
    label: "Initial" | "Incremental",
) => {
    const stats = {
        transactionsCreated: 0,
        duplicates: 0,
        skipped: 0,
    };

    for (const [index, message] of messages.entries()) {
        console.info(
            `[${label} ${index + 1}/${messages.length}] ${message.id}`,
        );

        try {
            const result = await processMessage(
                gmail,
                userId,
                message.id,
            );

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
        } catch (error) {
            if (isAuthorizationError(error)) {
                throw error;
            }

            console.error(
                `[${label}] Failed ${message.id}`,
                error,
            );

            // Do not continue. Incremental sync must not advance
            // the checkpoint past a message that failed to ingest.
            throw error;
        }
    }

    return stats;
};

export const performInitialSync = async (
    gmail: gmail_v1.Gmail,
    gmailAccount: GmailAccount,
    userId: string,
    options: SyncGmailDTO,
): Promise<GmailSyncStats> => {
    const response = await retry(
        () =>
            gmail.users.messages
                .list({
                    userId: "me",
                    q: GMAIL_QUERY,
                    maxResults: options.maxResults ?? 50,
                    pageToken: options.pageToken,
                })
                .then((result) => result.data),
        "Initial Gmail sync",
    );

    const messages = (response.messages ?? []).filter(
        (message): message is { id: string } =>
            Boolean(message.id),
    );

    const stats = await processMessages(
        gmail,
        userId,
        messages,
        "Initial",
    );

    const profile = await retry(
        () =>
            gmail.users
                .getProfile({userId: "me"})
                .then((result) => result.data),
        "Load Gmail profile",
    );

    if (!profile.historyId) {
        throw new Error(
            "Unable to determine Gmail historyId.",
        );
    }

    const lastSyncAt = await saveCheckpoint(
        gmailAccount.id,
        profile.historyId,
    );

    return {
        fetched: messages.length,
        transactionsCreated: stats.transactionsCreated,
        duplicates: stats.duplicates,
        skipped: stats.skipped,
        nextPageToken: response.nextPageToken ?? null,
        lastSyncAt,
    };
};

export const performIncrementalSync = async (
    gmail: gmail_v1.Gmail,
    gmailAccount: GmailAccount,
    userId: string,
): Promise<GmailSyncStats> => {
    const startHistoryId = gmailAccount.historyId;

    if (!startHistoryId) {
        throw new GmailHistoryExpiredError();
    }

    const messageIds = new Set<string>();
    let latestHistoryId = startHistoryId;
    let pageToken: string | undefined;

    try {
        do {
            const response = await retry(
                () =>
                    gmail.users.history
                        .list({
                            userId: "me",
                            startHistoryId,
                            pageToken,
                        })
                        .then((result) => result.data),
                "Load Gmail history",
            );

            console.info("[Gmail] History page", {
                startHistoryId,
                responseHistoryId: response.historyId,
                historyRecords: response.history?.length ?? 0,
                nextPageToken: response.nextPageToken ?? null,
            });

            latestHistoryId =
                response.historyId ?? latestHistoryId;

            for (const history of response.history ?? []) {
                for (const added of history.messagesAdded ?? []) {
                    const messageId = added.message?.id;

                    if (messageId) {
                        messageIds.add(messageId);
                    }
                }
            }

            pageToken = response.nextPageToken || undefined;
        } while (pageToken);
    } catch (error) {
        if (getErrorStatus(error) === 404) {
            throw new GmailHistoryExpiredError();
        }

        throw error;
    }

    console.info("[Gmail] Incremental sync", {
        previousHistoryId: startHistoryId,
        latestHistoryId,
        newMessages: messageIds.size,
    });

    const stats = await processMessages(
        gmail,
        userId,
        [...messageIds].map((id) => ({id})),
        "Incremental",
    );

    const lastSyncAt = await saveCheckpoint(
        gmailAccount.id,
        latestHistoryId,
    );

    return {
        fetched: messageIds.size,
        transactionsCreated: stats.transactionsCreated,
        duplicates: stats.duplicates,
        skipped: stats.skipped,
        nextPageToken: null,
        lastSyncAt,
    };
};

export const syncMailbox = async (
    userId: string,
    options: SyncGmailDTO = {},
): Promise<GmailSyncStats> => {
    const existingSync = activeSyncs.get(userId);

    if (existingSync) {
        console.info(
            "[Gmail] Sync already running; waiting for existing sync",
            {userId},
        );

        return existingSync;
    }

    const syncPromise = executeSyncMailbox(userId, options);

    activeSyncs.set(userId, syncPromise);

    try {
        return await syncPromise;
    } finally {
        if (activeSyncs.get(userId) === syncPromise) {
            activeSyncs.delete(userId);
        }
    }
};

const executeSyncMailbox = async (
    userId: string,
    options: SyncGmailDTO,
): Promise<GmailSyncStats> => {
    const startedAt = Date.now();
    let gmailAccount: GmailAccount | null = null;

    try {
        gmailAccount = await getConnectedGmailAccount(userId);

        const gmail = createGmailClient(
            gmailAccount.refreshToken,
        );

        let result: GmailSyncStats;

        try {
            result = gmailAccount.historyId
                ? await performIncrementalSync(
                    gmail,
                    gmailAccount,
                    userId,
                )
                : await performInitialSync(
                    gmail,
                    gmailAccount,
                    userId,
                    options,
                );
        } catch (error) {
            if (error instanceof GmailHistoryExpiredError) {
                console.warn(
                    "[Gmail] History expired; performing initial sync",
                );

                result = await performInitialSync(
                    gmail,
                    gmailAccount,
                    userId,
                    options,
                );
            } else {
                await handleAuthorizationError(
                    gmailAccount,
                    error,
                );
            }
        }

        console.info("[Gmail] Sync completed", {
            userId,
            email: gmailAccount.email,
            durationMs: Date.now() - startedAt,
            fetched: result!.fetched,
            created: result!.transactionsCreated,
            duplicates: result!.duplicates,
            skipped: result!.skipped,
        });

        return result!;
    } catch (error) {
        console.error("[Gmail] Sync failed", {
            userId,
            email: gmailAccount?.email,
            error,
        });

        throw error;
    }
};