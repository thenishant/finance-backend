import {gmail_v1, google} from "googleapis";

import {prisma} from "../../../database/prisma";
import {ingestGmailEmail} from "./ingestion/transaction.ingestion";
import {buildGmailQuery, createGmailClient, createGoogleClient, getConnectedGmailAccount,} from "./gmail.utils";
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

type ProcessMessageResult =
    | IngestionResult
    | {
    status: "not-found";
};

const activeSyncs = new Map<string, Promise<GmailSyncStats>>();

class GmailHistoryExpiredError extends Error {
    constructor() {
        super("Gmail history expired");
        this.name = "GmailHistoryExpiredError";
    }
}

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

const getErrorStatus = (
    error: unknown,
): number | undefined => {
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

const getErrorMessage = (
    error: unknown,
): string => {
    if (!error || typeof error !== "object") {
        return "";
    }

    const message =
        (error as { message?: unknown }).message;

    return typeof message === "string"
        ? message.toLowerCase()
        : "";
};

const getErrorReason = (
    error: unknown,
): string => {
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

/*
 * Only a confirmed token revocation should force a reconnect.
 * A bare 401/403 can also be a transient quota/rate-limit or
 * permission blip on a single message, and treating those the
 * same as revocation was disconnecting accounts (and wiping
 * their sync checkpoint) on errors that would have cleared up
 * on their own.
 */
const isAuthorizationError = (
    error: unknown,
): boolean => {
    const status = getErrorStatus(error);
    const message = getErrorMessage(error);
    const reason = getErrorReason(error);

    const isRevoked =
        message.includes("invalid_grant") ||
        message.includes("invalid_token") ||
        message.includes("unauthorized_client") ||
        reason.includes("invalid_grant") ||
        reason.includes("invalid_token") ||
        reason.includes("unauthorized_client");

    return isRevoked || status === 401;
};

const retry = async <T>(
    operation: () => Promise<T>,
    description: string,
    attempts = 3,
): Promise<T> => {
    let lastError: unknown;

    for (
        let attempt = 1;
        attempt <= attempts;
        attempt++
    ) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            const status = getErrorStatus(error);

            if (
                status === 401 ||
                status === 403 ||
                (status !== undefined &&
                    status >= 400 &&
                    status < 500)
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
        return decodeBase64(
            payload.body.data,
        );
    }

    const parts = payload.parts ?? [];

    const plainTextPart = parts.find(
        (part) =>
            part.mimeType === "text/plain",
    );

    if (plainTextPart) {
        const body =
            extractBody(plainTextPart);

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
        (part) =>
            part.mimeType === "text/html",
    );

    return htmlPart
        ? decodeBase64(htmlPart.body?.data)
        : "";
};

const getHeader = (
    headers:
    gmail_v1.Schema$MessagePartHeader[] = [],
    name: string,
): string | null =>
    headers.find(
        (header) =>
            header.name?.toLowerCase() ===
            name.toLowerCase(),
    )?.value ?? null;

const saveCheckpoint = async (
    gmailAccountId: string,
    historyId: string,
): Promise<Date> => {
    const lastSyncAt = new Date();

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

const handleAuthorizationError = async (
    gmailAccount: GmailAccount,
    error: unknown,
): Promise<never> => {
    if (!isAuthorizationError(error)) {
        throw error;
    }

    console.error(
        "[Google] Gmail authorization revoked",
        {
            email: gmailAccount.email,
        },
    );

    try {
        const client = createGoogleClient();

        client.setCredentials({
            refresh_token: gmailAccount.refreshToken,
        });

        await google.gmail({
            version: "v1",
            auth: client,
        }).users.stop({
            userId: "me",
        });
    } catch {
        /*
         * Best-effort: if the credentials are already revoked,
         * Google will reject this too. Either way we still need
         * to remove the local record below so stale push
         * notifications stop resolving to a real account.
         */
    }

    /*
     * Flag the account rather than deleting it. historyId,
     * refreshToken and watch state all stay put, so once the user
     * reconnects the same row is reused and incremental sync
     * resumes exactly where it left off — no backfill window, no
     * risk of missed or duplicated transactions.
     */
    await prisma.gmailAccount.update({
        where: {
            id: gmailAccount.id,
        },
        data: {
            needsReconnect: true,
            reconnectReason: getErrorMessage(error) || getErrorReason(error) || "unknown",
            watchExpiresAt: null,
        },
    });

    throw new GmailReconnectRequiredError();
};

export const processMessage = async (
    gmail: gmail_v1.Gmail,
    userId: string,
    messageId: string,
): Promise<ProcessMessageResult> => {
    let detail: gmail_v1.Schema$Message;

    try {
        detail = (
            await retry(
                () =>
                    gmail.users.messages.get({
                        userId: "me",
                        id: messageId,
                    }),
                `Fetch Gmail message ${messageId}`,
            )
        ).data;
    } catch (error) {
        if (getErrorStatus(error) === 404) {
            console.warn(
                `[Gmail] Message no longer available; skipping ${messageId}`,
            );

            return {
                status: "not-found",
            };
        }

        throw error;
    }

    const payload = detail.payload;
    const headers = payload?.headers ?? [];

    return ingestGmailEmail({
        userId,
        gmailMessageId: messageId,
        sender: getHeader(
            headers,
            "from",
        ),
        subject: getHeader(
            headers,
            "subject",
        ),
        body: cleanEmailBody(
            extractBody(payload),
        ),
        receivedAt: detail.internalDate
            ? new Date(
                Number(detail.internalDate),
            )
            : null,
    });
};

/*
 * A message that fails ingestion this many times in a row is
 * quarantined: we stop retrying it and let the checkpoint move
 * past it, so one persistently-bad message (a parser edge case, a
 * transient DB issue that keeps recurring, ...) can't block every
 * future sync for the account forever. It's still logged with its
 * last error for manual follow-up.
 */
const MAX_MESSAGE_FAILURES = 3;

/**
 * Records an ingestion failure for a message and reports whether
 * it has now failed enough times to be quarantined.
 */
const recordMessageFailure = async (
    gmailAccountId: string,
    messageId: string,
    error: unknown,
): Promise<boolean> => {
    const lastError =
        error instanceof Error
            ? error.message
            : String(error);

    const record =
        await prisma.gmailMessage.upsert({
            where: {
                gmailMessageId: messageId,
            },
            create: {
                gmailMessageId: messageId,
                gmailAccountId,
                failedAttempts: 1,
                lastError,
            },
            update: {
                failedAttempts: {
                    increment: 1,
                },
                lastError,
            },
        });

    if (record.failedAttempts >= MAX_MESSAGE_FAILURES) {
        await prisma.gmailMessage.update({
            where: {
                gmailMessageId: messageId,
            },
            data: {
                quarantinedAt: new Date(),
            },
        });

        return true;
    }

    return false;
};

const processMessages = async (
    gmail: gmail_v1.Gmail,
    userId: string,
    gmailAccountId: string,
    messages: { id: string }[],
    label: "Initial" | "Incremental",
) => {
    const stats = {
        transactionsCreated: 0,
        duplicates: 0,
        skipped: 0,
    };

    for (
        const [index, message]
        of messages.entries()
        ) {
        console.info(
            `[${label} ${index + 1}/${messages.length}] ${message.id}`,
        );

        try {
            const result =
                await processMessage(
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

                case "not-found":
                    stats.skipped++;

                    console.info(
                        `[${label}] Message no longer available; skipped ${message.id}`,
                    );
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

            const quarantined =
                await recordMessageFailure(
                    gmailAccountId,
                    message.id,
                    error,
                );

            if (quarantined) {
                console.error(
                    `[${label}] Quarantining message after ${MAX_MESSAGE_FAILURES} failed attempts; skipping`,
                    {
                        messageId: message.id,
                    },
                );

                stats.skipped++;
                continue;
            }

            /*
             * Under the failure limit: do not continue. The
             * checkpoint must not advance past a message that
             * failed to ingest, so the whole batch is retried
             * (this message included) on the next sync.
             */
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
    /*
     * If this Gmail account has never synced before, there is no
     * backfill boundary and we perform a normal initial import.
     *
     * If the account was disconnected and later reconnected,
     * gmailAccount.lastSyncAt will be null because it is a new
     * GmailAccount record. In that case, use User.gmailLastSyncAt
     * as the reconnect backfill boundary.
     */
    const user = await prisma.user.findUnique({
        where: {
            id: userId,
        },
        select: {
            gmailLastSyncAt: true,
        },
    });

    const gmailQuery = buildGmailQuery(
        gmailAccount.lastSyncAt ??
        user?.gmailLastSyncAt,
    );

    console.info("[Gmail] Initial sync query",
        {
            userId,
            reconnectBackfill: Boolean(user?.gmailLastSyncAt),
            gmailLastSyncAt: user?.gmailLastSyncAt ?? null,
            query: gmailQuery,
        },
    );

    /*
     * Snapshot historyId BEFORE listing/processing any messages,
     * not after. If we captured it at the end instead, any message
     * that arrived in the (potentially long, multi-page) window
     * while this sync was running could fall through the gap: it
     * wouldn't be in the already-executed `messages.list` results,
     * and the next incremental sync only looks at history strictly
     * after the saved checkpoint - so it would never be fetched at
     * all. Snapshotting first guarantees anything that arrives
     * during this sync is picked up by the following incremental
     * sync instead.
     */
    const startProfile = await retry(
        () =>
            gmail.users
                .getProfile({
                    userId: "me",
                })
                .then(
                    (result) =>
                        result.data,
                ),
        "Load Gmail profile (start)",
    );

    if (!startProfile.historyId) {
        throw new Error(
            "Unable to determine Gmail historyId.",
        );
    }

    let pageToken =
        options.pageToken;

    let fetched = 0;
    let transactionsCreated = 0;
    let duplicates = 0;
    let skipped = 0;

    let nextPageToken: string | null = null;

    do {
        const response = await retry(
            () =>
                gmail.users.messages
                    .list({
                        userId: "me",
                        q: gmailQuery,
                        maxResults:
                            options.maxResults ?? 50,
                        pageToken,
                    })
                    .then(
                        (result) =>
                            result.data,
                    ),
            "Initial Gmail sync",
        );

        const messages =
            (response.messages ?? [])
                .filter(
                    (
                        message,
                    ): message is {
                        id: string;
                    } =>
                        Boolean(
                            message.id,
                        ),
                );

        const stats =
            await processMessages(
                gmail,
                userId,
                gmailAccount.id,
                messages,
                "Initial",
            );

        fetched += messages.length;
        transactionsCreated +=
            stats.transactionsCreated;
        duplicates += stats.duplicates;
        skipped += stats.skipped;

        nextPageToken =
            response.nextPageToken ??
            null;

        pageToken =
            response.nextPageToken ??
            undefined;

        console.info(
            "[Gmail] Initial sync page completed",
            {
                fetched: messages.length,
                totalFetched: fetched,
                transactionsCreated:
                stats.transactionsCreated,
                totalTransactionsCreated:
                transactionsCreated,
                duplicates:
                stats.duplicates,
                skipped:
                stats.skipped,
                nextPageToken,
            },
        );
    } while (pageToken);

    /*
     * The checkpoint is the historyId captured BEFORE listing
     * began (see above) - not one taken now, after all pages have
     * been processed. Do not swap this for a fresh getProfile()
     * call here.
     */
    const lastSyncAt =
        await saveCheckpoint(
            gmailAccount.id,
            startProfile.historyId,
        );

    return {
        fetched,
        transactionsCreated,
        duplicates,
        skipped,
        /*
         * All pages were consumed.
         * There is therefore no remaining page to return.
         */
        nextPageToken: null,
        lastSyncAt,
    };
};

export const performIncrementalSync = async (
    gmail: gmail_v1.Gmail,
    gmailAccount: GmailAccount,
    userId: string,
): Promise<GmailSyncStats> => {
    const startHistoryId =
        gmailAccount.historyId;

    if (!startHistoryId) {
        throw new GmailHistoryExpiredError();
    }

    const messageIds =
        new Set<string>();

    let latestHistoryId =
        startHistoryId;

    let pageToken:
        string | undefined;

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
                        .then(
                            (result) =>
                                result.data,
                        ),
                "Load Gmail history",
            );

            console.info(
                "[Gmail] History page",
                {
                    startHistoryId,
                    responseHistoryId:
                    response.historyId,
                    historyRecords:
                        response.history
                            ?.length ?? 0,
                    nextPageToken:
                        response.nextPageToken ??
                        null,
                },
            );

            latestHistoryId =
                response.historyId ??
                latestHistoryId;

            for (
                const history
                of response.history ?? []
                ) {
                for (
                    const added
                    of history.messagesAdded ??
                []
                    ) {
                    const messageId =
                        added.message?.id;

                    if (messageId) {
                        messageIds.add(
                            messageId,
                        );
                    }
                }
            }

            pageToken =
                response.nextPageToken ||
                undefined;
        } while (pageToken);
    } catch (error) {
        if (
            getErrorStatus(error) ===
            404
        ) {
            throw new GmailHistoryExpiredError();
        }

        throw error;
    }

    console.info(
        "[Gmail] Incremental sync",
        {
            previousHistoryId:
            startHistoryId,
            latestHistoryId,
            newMessages:
            messageIds.size,
        },
    );

    const stats =
        await processMessages(
            gmail,
            userId,
            gmailAccount.id,
            [...messageIds].map(
                (id) => ({id}),
            ),
            "Incremental",
        );

    const lastSyncAt =
        await saveCheckpoint(
            gmailAccount.id,
            latestHistoryId,
        );

    return {
        fetched: messageIds.size,
        transactionsCreated:
        stats.transactionsCreated,
        duplicates:
        stats.duplicates,
        skipped:
        stats.skipped,
        nextPageToken: null,
        lastSyncAt,
    };
};

export const syncMailbox = async (
    userId: string,
    options: SyncGmailDTO = {},
): Promise<GmailSyncStats> => {
    const existingSync =
        activeSyncs.get(userId);

    if (existingSync) {
        console.info(
            "[Gmail] Sync already running; waiting for existing sync",
            {userId},
        );

        return existingSync;
    }

    const syncPromise =
        executeSyncMailbox(
            userId,
            options,
        );

    activeSyncs.set(
        userId,
        syncPromise,
    );

    try {
        return await syncPromise;
    } finally {
        if (
            activeSyncs.get(userId) ===
            syncPromise
        ) {
            activeSyncs.delete(
                userId,
            );
        }
    }
};

const executeSyncMailbox = async (
    userId: string,
    options: SyncGmailDTO,
): Promise<GmailSyncStats> => {
    const startedAt =
        Date.now();

    let gmailAccount:
        GmailAccount | null = null;

    try {
        gmailAccount =
            await getConnectedGmailAccount(
                userId,
            );

        const gmail =
            createGmailClient(
                gmailAccount.refreshToken,
            );

        let result:
            GmailSyncStats;

        try {
            result =
                gmailAccount.historyId
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
            if (
                error instanceof
                GmailHistoryExpiredError
            ) {
                console.warn(
                    "[Gmail] History expired; performing initial sync",
                );

                result =
                    await performInitialSync(
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

        console.info(
            "[Gmail] Sync completed",
            {
                userId,
                email:
                gmailAccount.email,
                durationMs:
                    Date.now() -
                    startedAt,
                fetched:
                result!.fetched,
                created:
                result!
                    .transactionsCreated,
                duplicates:
                result!
                    .duplicates,
                skipped:
                result!.skipped,
            },
        );

        return result!;
    } catch (error) {
        console.error(
            "[Gmail] Sync failed",
            {
                userId,
                email:
                gmailAccount?.email,
                error,
            },
        );

        throw error;
    }
};