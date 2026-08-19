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

export const processMessage = async (
    gmail: gmail_v1.Gmail,
    userId: string,
    messageId: string,
): Promise<Awaited<ReturnType<typeof ingestGmailEmail>>> => {

    const detail = await retry(
        async () =>
            await gmail.users.messages.get({
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
        body: cleanEmailBody(
            extractBody(payload),
        ),
        receivedAt: detail.data.internalDate
            ? new Date(Number(detail.data.internalDate))
            : null,
    });

};

const processMessages = async (
    gmail: gmail_v1.Gmail,
    userId: string,
    messages: {
        id: string;
    }[],
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

                default:
                    stats.skipped++;
                    break;

            }

        } catch (error) {

            if (
                isAuthorizationError(error)
            ) {
                throw error;
            }

            console.error(
                `[${label}] Failed ${message.id}`,
                error,
            );

            stats.skipped++;

        }

    }

    return stats;

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

const isAuthorizationError = (
    error: any,
): boolean => {

    const status =
        error?.code ??
        error?.response?.status;

    const message =
        String(
            error?.message ?? "",
        ).toLowerCase();

    const reason =
        String(
            error?.response?.data?.error ??
            "",
        ).toLowerCase();

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

    await prisma.gmailAccount.delete({
        where: {
            id: gmailAccount.id,
        },
    });

    throw Object.assign(
        new Error(
            "Gmail authorization has expired. Please reconnect your Gmail account.",
        ),
        {
            cause: error,
        },
    );

};

const sleep = (
    ms: number,
): Promise<void> =>
    new Promise(resolve =>
        setTimeout(resolve, ms),
    );

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

        } catch (error: any) {

            lastError = error;

            const status =
                error?.code ??
                error?.response?.status;

            //
            // Don't retry auth failures.
            //
            if (
                status === 401 ||
                status === 403
            ) {
                throw error;
            }

            //
            // Don't retry client errors.
            //
            if (
                status &&
                status >= 400 &&
                status < 500
            ) {
                throw error;
            }

            console.warn(
                `[Retry ${attempt}/${attempts}] ${description}`,
                {
                    status,
                    message: error?.message,
                },
            );

            if (attempt < attempts) {

                await sleep(
                    attempt * 500,
                );

            }

        }

    }

    throw lastError;

};

type GmailAccount = Awaited<ReturnType<typeof getConnectedGmailAccount>>;

export const performInitialSync = async (
    gmail: gmail_v1.Gmail,
    gmailAccount: GmailAccount,
    userId: string,
    options: SyncGmailDTO,
): Promise<GmailSyncStats> => {

    const response =
        await retry<gmail_v1.Schema$ListMessagesResponse>(
            async () =>
                (
                    await gmail.users.messages.list({
                        userId: "me",
                        q: GMAIL_QUERY,
                        maxResults: options.maxResults ?? 50,
                        pageToken: options.pageToken,
                    })
                ).data,
            "Initial Gmail sync",
        );

    const messages =
        (response.messages ?? []).filter(
            (
                message,
            ): message is gmail_v1.Schema$Message & {
                id: string;
            } => Boolean(message.id),
        );

    const stats =
        await processMessages(
            gmail,
            userId,
            messages,
            "Initial",
        );

    const profile =
        await retry<gmail_v1.Schema$Profile>(
            async () =>
                (
                    await gmail.users.getProfile({
                        userId: "me",
                    })
                ).data,
            "Load Gmail profile",
        );

    if (!profile.historyId) {
        throw new Error(
            "Unable to determine Gmail historyId.",
        );
    }

    const lastSyncAt =
        await saveCheckpoint(
            gmailAccount.id,
            profile.historyId,
        );

    return {
        fetched: messages.length,
        transactionsCreated:
        stats.transactionsCreated,
        duplicates:
        stats.duplicates,
        skipped:
        stats.skipped,
        nextPageToken:
            response.nextPageToken ?? null,
        lastSyncAt,
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

    const messageIds =
        new Set<string>();

    let latestHistoryId =
        gmailAccount.historyId;

    let pageToken:
        string | undefined =
        undefined;

    try {

        do {

            const response =
                await retry<gmail_v1.Schema$ListHistoryResponse>(
                    async () =>
                        (
                            await gmail.users.history.list({
                                userId: "me",
                                startHistoryId:
                                    gmailAccount.historyId!,
                                historyTypes: [
                                    "messageAdded",
                                ],
                                pageToken,
                            })
                        ).data,
                    "Load Gmail history",
                );

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
                response.nextPageToken ||
                undefined;

        } while (pageToken);

    } catch (error: any) {

        if (
            error?.code === 404 ||
            error?.response?.status === 404
        ) {
            throw new GmailHistoryExpiredError();
        }

        throw error;

    }

    console.info(
        "[Gmail] Incremental sync",
        {
            previousHistoryId:
            gmailAccount.historyId,
            latestHistoryId,
            newMessages:
            messageIds.size,
        },
    );

    const stats =
        await processMessages(
            gmail,
            userId,
            [...messageIds].map(id => ({
                id,
            })),
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

}

export const syncMailbox = async (
    userId: string,
    options: SyncGmailDTO = {},
): Promise<GmailSyncStats> => {

    if (activeSyncs.has(userId)) {

        console.info(
            "[Gmail] Sync already running",
            {userId},
        );

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

    const startedAt =
        Date.now();

    let gmailAccount:
        GmailAccount | null =
        null;

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
                throw error;
            }

        }

        console.info(
            "[Gmail] Sync completed",
            {
                userId,
                email:
                gmailAccount.email,
                durationMs:
                    Date.now() - startedAt,
                fetched:
                result.fetched,
                created:
                result.transactionsCreated,
                duplicates:
                result.duplicates,
                skipped:
                result.skipped,
            },
        );

        return result;

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

    } finally {

        activeSyncs.delete(
            userId,
        );

    }

};