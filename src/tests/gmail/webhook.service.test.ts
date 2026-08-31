import {beforeEach, describe, expect, it, vi,} from "vitest";
import {handleGmailWebhook,} from "../../modules/email/gmail/webhook/webhook.service";

const mocks = vi.hoisted(() => ({
    gmailAccountFindUnique:
        vi.fn(),

    syncMailbox:
        vi.fn(),
}));

vi.mock(
    "../../database/prisma",
    () => ({
        prisma: {
            gmailAccount: {
                findUnique:
                mocks.gmailAccountFindUnique,
            },
        },
    }),
);

vi.mock(
    "../../modules/email/gmail/gmail.sync",
    () => ({
        syncMailbox:
        mocks.syncMailbox,
    }),
);

const createPayload = (
    notification: object,
    messageId = "pubsub-message-1",
) => ({
    message: {
        messageId,
        data: Buffer
            .from(
                JSON.stringify(
                    notification,
                ),
            )
            .toString("base64"),
    },
});

const connectedAccount = () => ({
    id: "gmail-account-1",
    userId: "user-1",
    email: "test@gmail.com",
    refreshToken: "refresh-token",
    historyId: "100",
});

describe("Gmail webhook", () => {

    beforeEach(() => {
        vi.clearAllMocks();

        mocks.gmailAccountFindUnique
            .mockResolvedValue(
                connectedAccount(),
            );

        mocks.syncMailbox
            .mockResolvedValue({
                fetched: 0,
                transactionsCreated: 0,
                duplicates: 0,
                skipped: 0,
                nextPageToken: null,
                lastSyncAt: new Date(),
            });
    });

    it(
        "triggers Gmail sync for the connected Gmail account",
        async () => {

            await handleGmailWebhook(
                createPayload({
                    emailAddress:
                        "test@gmail.com",
                    historyId:
                        "105",
                }),
            );

            expect(
                mocks.gmailAccountFindUnique,
            ).toHaveBeenCalledWith({
                where: {
                    email:
                        "test@gmail.com",
                },
            });

            expect(
                mocks.syncMailbox,
            ).toHaveBeenCalledWith(
                "user-1",
            );
        },
    );

    it(
        "does not sync when Pub/Sub data is missing",
        async () => {

            await handleGmailWebhook({
                message: {},
            });

            expect(
                mocks.gmailAccountFindUnique,
            ).not.toHaveBeenCalled();

            expect(
                mocks.syncMailbox,
            ).not.toHaveBeenCalled();
        },
    );

    it(
        "does not sync invalid JSON",
        async () => {

            await handleGmailWebhook({
                message: {
                    messageId:
                        "pubsub-message-1",
                    data: Buffer
                        .from("not-json")
                        .toString("base64"),
                },
            });

            expect(
                mocks.gmailAccountFindUnique,
            ).not.toHaveBeenCalled();

            expect(
                mocks.syncMailbox,
            ).not.toHaveBeenCalled();
        },
    );

    it(
        "does not sync when emailAddress is missing",
        async () => {

            await handleGmailWebhook(
                createPayload({
                    historyId:
                        "105",
                }),
            );

            expect(
                mocks.gmailAccountFindUnique,
            ).not.toHaveBeenCalled();

            expect(
                mocks.syncMailbox,
            ).not.toHaveBeenCalled();
        },
    );

    it(
        "does not sync when historyId is missing",
        async () => {

            await handleGmailWebhook(
                createPayload({
                    emailAddress:
                        "test@gmail.com",
                }),
            );

            expect(
                mocks.gmailAccountFindUnique,
            ).not.toHaveBeenCalled();

            expect(
                mocks.syncMailbox,
            ).not.toHaveBeenCalled();
        },
    );

    it(
        "does not sync when Gmail account is not connected",
        async () => {

            mocks.gmailAccountFindUnique
                .mockResolvedValueOnce(
                    null,
                );

            await handleGmailWebhook(
                createPayload({
                    emailAddress:
                        "unknown@gmail.com",
                    historyId:
                        "105",
                }),
            );

            expect(
                mocks.gmailAccountFindUnique,
            ).toHaveBeenCalledWith({
                where: {
                    email:
                        "unknown@gmail.com",
                },
            });

            expect(
                mocks.syncMailbox,
            ).not.toHaveBeenCalled();
        },
    );

    it(
        "passes only the userId to syncMailbox",
        async () => {

            mocks.gmailAccountFindUnique
                .mockResolvedValueOnce(
                    connectedAccount(),
                );

            await handleGmailWebhook(
                createPayload({
                    emailAddress:
                        "test@gmail.com",
                    historyId:
                        "200",
                }),
            );

            expect(
                mocks.syncMailbox,
            ).toHaveBeenCalledTimes(1);

            expect(
                mocks.syncMailbox,
            ).toHaveBeenCalledWith(
                "user-1",
            );

            expect(
                mocks.syncMailbox,
            ).not.toHaveBeenCalledWith(
                "user-1",
                expect.anything(),
            );
        },
    );

    it(
        "does not reject when background Gmail sync fails",
        async () => {

            mocks.gmailAccountFindUnique
                .mockResolvedValueOnce(
                    connectedAccount(),
                );

            mocks.syncMailbox
                .mockRejectedValueOnce(
                    new Error(
                        "Gmail sync failed",
                    ),
                );

            await expect(
                handleGmailWebhook(
                    createPayload({
                        emailAddress:
                            "test@gmail.com",
                        historyId:
                            "105",
                    }),
                ),
            ).resolves.toBeUndefined();

            expect(
                mocks.syncMailbox,
            ).toHaveBeenCalledWith(
                "user-1",
            );

            /*
             * Give the detached promise a chance to execute
             * its rejection handler.
             */
            await new Promise(
                resolve =>
                    setImmediate(resolve),
            );
        },
    );
});