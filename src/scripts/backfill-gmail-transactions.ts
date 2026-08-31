import {gmail_v1} from "googleapis";

import {createGmailClient, getConnectedGmailAccount, GMAIL_QUERY,} from "../modules/email/gmail/gmail.utils";

import {processMessage} from "../modules/email/gmail/gmail.sync";

const DRY_RUN = process.argv.includes("--dry-run");

const getArg = (
    name: string,
): string | undefined => {
    const index = process.argv.indexOf(name);

    if (
        index === -1 ||
        index + 1 >= process.argv.length
    ) {
        return undefined;
    }

    return process.argv[index + 1];
};

const QUERY =
    getArg("--query") ?? GMAIL_QUERY;

const MAX_RESULTS = Number(
    getArg("--max-results") ?? "10",
);

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

            if (
                status === 401 ||
                status === 403
            ) {
                throw error;
            }

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

const listAllMessageIds = async (
    gmail: gmail_v1.Gmail,
): Promise<string[]> => {
    const messageIds = new Set<string>();

    let pageToken:
        string | undefined;

    do {
        const response =
            await retry(
                async () =>
                    (
                        await gmail.users.messages.list({
                            userId: "me",
                            q: QUERY,
                            maxResults:
                                Math.min(
                                    Math.max(
                                        MAX_RESULTS,
                                        1,
                                    ),
                                    500,
                                ),
                            pageToken,
                        })
                    ).data,
                "List Gmail backfill messages",
            );

        for (
            const message
            of response.messages ?? []
            ) {
            if (message.id) {
                messageIds.add(
                    message.id,
                );
            }
        }

        pageToken =
            response.nextPageToken ||
            undefined;

        console.info(
            "[Gmail Backfill] Search page",
            {
                fetched:
                messageIds.size,
                nextPageToken:
                    Boolean(pageToken),
            },
        );
    } while (pageToken);

    return [...messageIds];
};

const main = async () => {
    console.log(
        "\n========================================",
    );
    console.log(
        "Gmail Transaction Backfill",
    );
    console.log(
        "========================================",
    );

    console.log(
        `Mode: ${DRY_RUN ? "DRY-RUN" : "LIVE"}`,
    );

    console.log(
        `Query: ${QUERY}`,
    );

    console.log(
        `Max results/page: ${MAX_RESULTS}`,
    );

    console.log("");

    const userId =
        getRequiredUserId();

    const gmailAccount =
        await getConnectedGmailAccount(
            userId,
        );

    console.log(
        `[Gmail Backfill] Account: ${gmailAccount.email}`,
    );

    const gmail =
        createGmailClient(
            gmailAccount.refreshToken,
        );

    const messageIds =
        await listAllMessageIds(
            gmail,
        );

    console.log(
        `\nFound ${messageIds.length} Gmail messages.`,
    );

    if (messageIds.length === 0) {
        console.log(
            "Nothing to backfill.",
        );
        return;
    }

    let created = 0;
    let updated = 0;
    let duplicates = 0;
    let skipped = 0;
    let failed = 0;

    for (
        const [index, messageId]
        of messageIds.entries()
        ) {
        console.log(
            "\n----------------------------------------",
        );

        console.log(
            `[${index + 1}/${messageIds.length}] ${messageId}`,
        );

        try {
            if (DRY_RUN) {
                console.log(
                    "DRY-RUN: fetching message.",
                );

                await retry(
                    async () =>
                        gmail.users.messages.get({
                            userId: "me",
                            id: messageId,
                        }),
                    `Fetch Gmail message ${messageId}`,
                );

                console.log(
                    "DRY-RUN: message can be fetched.",
                );

                continue;
            }

            const result =
                await processMessage(
                    gmail,
                    userId,
                    messageId,
                );

            if (
                result.status ===
                "created"
            ) {
                created++;

                console.log(
                    `CREATED: ${result.transactionId}`,
                );
            } else if (
                result.status ===
                "updated"
            ) {
                updated++;

                console.log(
                    `UPDATED: ${result.transactionId}`,
                );
            } else if (
                result.status ===
                "duplicate"
            ) {
                duplicates++;

                console.log(
                    `DUPLICATE: ${
                        "transactionId" in result
                            ? result.transactionId
                            : "already exists"
                    }`,
                );
            } else if (
                result.status ===
                "unsupported"
            ) {
                skipped++;

                console.log(
                    "SKIPPED: unsupported bank.",
                );
            } else if (
                result.status ===
                "not-a-transaction"
            ) {
                skipped++;

                console.log(
                    "SKIPPED: not a transaction.",
                );
            }
        } catch (error) {
            failed++;

            console.error(
                `FAILED: ${messageId}`,
            );

            console.error(
                error instanceof Error
                    ? error.message
                    : error,
            );
        }
    }

    console.log(
        "\n========================================",
    );
    console.log(
        "Gmail Backfill Complete",
    );
    console.log(
        "========================================",
    );

    console.log(
        `Found:      ${messageIds.length}`,
    );

    console.log(
        `Created:    ${created}`,
    );

    console.log(
        `Updated:    ${updated}`,
    );

    console.log(
        `Duplicates: ${duplicates}`,
    );

    console.log(
        `Skipped:    ${skipped}`,
    );

    console.log(
        `Failed:     ${failed}`,
    );

    console.log(
        "========================================",
    );

    console.log(
        "Gmail historyId was not modified.",
    );
};
const getRequiredUserId = (): string => {
    const userId =
        getArg("--user-id") ??
        process.env.GMAIL_BACKFILL_USER_ID;

    if (!userId) {
        throw new Error(
            "Missing --user-id. Example: --user-id <USER_ID>",
        );
    }

    return userId;
};

main()
    .catch(error => {
        console.error(
            "\nGmail backfill failed:",
        );

        console.error(
            error instanceof Error
                ? error.message
                : error,
        );

        process.exitCode = 1;
    });