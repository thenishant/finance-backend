import {beforeEach, describe, expect, it, vi,} from "vitest";
import {
    performIncrementalSync,
    performInitialSync,
    processMessage,
    syncMailbox,
} from "../../modules/email/gmail/gmail.sync";

const mocks = vi.hoisted(() => ({
    ingestGmailEmail: vi.fn(),
    createGmailClient: vi.fn(),
    getConnectedGmailAccount: vi.fn(),

    gmailAccountFindUnique: vi.fn(),
    gmailAccountUpdate: vi.fn(),
    gmailAccountDelete: vi.fn(),
}));

vi.mock(
    "../../database/prisma",
    () => ({
        prisma: {
            gmailAccount: {
                findUnique:
                mocks.gmailAccountFindUnique,

                update:
                mocks.gmailAccountUpdate,

                delete:
                mocks.gmailAccountDelete,
            },
        },
    }),
);

vi.mock(
    "../../modules/email/gmail/ingestion/transaction.ingestion",
    () => ({
        ingestGmailEmail:
        mocks.ingestGmailEmail,
    }),
);

vi.mock(
    "../../modules/email/gmail/gmail.utils",
    () => ({
        GMAIL_QUERY:
            "{from:alerts@axis.bank.in from:alerts@hdfcbank.bank.in} newer_than:30d",

        createGmailClient:
        mocks.createGmailClient,

        getConnectedGmailAccount:
        mocks.getConnectedGmailAccount,
    }),
);

describe("gmail.sync", () => {

    beforeEach(() => {
        vi.clearAllMocks();

        mocks.ingestGmailEmail
            .mockResolvedValue({
                status: "created",
                transactionId: "transaction-1",
            });

        mocks.gmailAccountFindUnique
            .mockResolvedValue({
                id: "gmail-account-1",
                userId: "user-1",
                email: "user@gmail.com",
                refreshToken: "refresh-token",
                historyId: null,
            });

        mocks.gmailAccountUpdate
            .mockResolvedValue({});

        mocks.gmailAccountDelete
            .mockResolvedValue({});

        mocks.getConnectedGmailAccount
            .mockResolvedValue({
                id: "gmail-account-1",
                userId: "user-1",
                email: "user@gmail.com",
                refreshToken: "refresh-token",
                historyId: null,
            });
    });

    describe("processMessage", () => {

        it("fetches the Gmail message and ingests it", async () => {

            const gmail = {
                users: {
                    messages: {
                        get: vi.fn()
                            .mockResolvedValue({
                                data: {
                                    internalDate:
                                        "1756116000000",

                                    payload: {
                                        headers: [
                                            {
                                                name: "From",
                                                value:
                                                    "alerts@hdfcbank.bank.in",
                                            },
                                            {
                                                name: "Subject",
                                                value:
                                                    "Rs. 500 debited",
                                            },
                                        ],

                                        body: {
                                            data:
                                                Buffer
                                                    .from(
                                                        "Rs. 500 has been debited",
                                                    )
                                                    .toString(
                                                        "base64",
                                                    ),
                                        },
                                    },
                                },
                            }),
                    },
                },
            } as any;

            const result =
                await processMessage(
                    gmail,
                    "user-1",
                    "gmail-message-1",
                );

            expect(result).toEqual({
                status: "created",
                transactionId: "transaction-1",
            });

            expect(
                gmail.users.messages.get,
            ).toHaveBeenCalledWith({
                userId: "me",
                id: "gmail-message-1",
            });

            expect(
                mocks.ingestGmailEmail,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: "user-1",
                    gmailMessageId:
                        "gmail-message-1",
                    sender:
                        "alerts@hdfcbank.bank.in",
                    subject:
                        "Rs. 500 debited",
                }),
            );
        });
    });

    describe("performInitialSync", () => {

        it("imports listed messages and saves the history checkpoint", async () => {

            const gmail = {
                users: {
                    messages: {
                        list: vi.fn()
                            .mockResolvedValue({
                                data: {
                                    messages: [
                                        {
                                            id: "message-1",
                                        },
                                        {
                                            id: "message-2",
                                        },
                                        {},
                                    ],
                                    nextPageToken:
                                        "next-page",
                                },
                            }),

                        get: vi.fn()
                            .mockImplementation(
                                async ({
                                           id,
                                       }: {
                                    id: string;
                                }) => ({
                                    data: {
                                        payload: {
                                            headers: [],
                                            body: {
                                                data:
                                                    Buffer
                                                        .from(
                                                            `message ${id}`,
                                                        )
                                                        .toString(
                                                            "base64",
                                                        ),
                                            },
                                        },
                                    },
                                }),
                            ),
                    },

                    getProfile: vi.fn()
                        .mockResolvedValue({
                            data: {
                                historyId:
                                    "history-100",
                            },
                        }),
                },
            } as any;

            const account = {
                id: "gmail-account-1",
                userId: "user-1",
                email: "user@gmail.com",
                refreshToken: "refresh-token",
                historyId: null,
            };

            const result =
                await performInitialSync(
                    gmail,
                    account as any,
                    "user-1",
                    {
                        maxResults: 10,
                    },
                );

            expect(result.fetched).toBe(2);

            expect(
                result.transactionsCreated,
            ).toBe(2);

            expect(
                result.duplicates,
            ).toBe(0);

            expect(
                result.skipped,
            ).toBe(0);

            expect(
                result.nextPageToken,
            ).toBe("next-page");

            expect(
                mocks.gmailAccountUpdate,
            ).toHaveBeenCalledWith({
                where: {
                    id: "gmail-account-1",
                },
                data: expect.objectContaining({
                    historyId:
                        "history-100",
                }),
            });
        });

        it("counts duplicates and skipped messages", async () => {

            mocks.ingestGmailEmail
                .mockResolvedValueOnce({
                    status: "created",
                    transactionId:
                        "transaction-1",
                })
                .mockResolvedValueOnce({
                    status: "duplicate",
                })
                .mockResolvedValueOnce({
                    status:
                        "not-a-transaction",
                });

            const gmail = {
                users: {
                    messages: {
                        list: vi.fn()
                            .mockResolvedValue({
                                data: {
                                    messages: [
                                        {id: "1"},
                                        {id: "2"},
                                        {id: "3"},
                                    ],
                                },
                            }),

                        get: vi.fn()
                            .mockResolvedValue({
                                data: {
                                    payload: {
                                        headers: [],
                                        body: {
                                            data:
                                                Buffer
                                                    .from(
                                                        "test",
                                                    )
                                                    .toString(
                                                        "base64",
                                                    ),
                                        },
                                    },
                                },
                            }),
                    },

                    getProfile: vi.fn()
                        .mockResolvedValue({
                            data: {
                                historyId:
                                    "history-1",
                            },
                        }),
                },
            } as any;

            const result =
                await performInitialSync(
                    gmail,
                    {
                        id: "account-1",
                        userId: "user-1",
                        email: "user@gmail.com",
                        refreshToken:
                            "refresh",
                        historyId: null,
                    } as any,
                    "user-1",
                    {},
                );

            expect(
                result.transactionsCreated,
            ).toBe(1);

            expect(
                result.duplicates,
            ).toBe(1);

            expect(
                result.skipped,
            ).toBe(1);
        });
    });

    describe("performIncrementalSync", () => {

        it("processes newly added messages", async () => {

            const gmail = {
                users: {
                    history: {
                        list: vi.fn()
                            .mockResolvedValue({
                                data: {
                                    historyId:
                                        "history-20",
                                    history: [
                                        {
                                            messagesAdded: [
                                                {
                                                    message: {
                                                        id: "message-1",
                                                    },
                                                },
                                                {
                                                    message: {
                                                        id: "message-2",
                                                    },
                                                },
                                            ],
                                        },
                                    ],
                                },
                            }),
                    },

                    messages: {
                        get: vi.fn()
                            .mockResolvedValue({
                                data: {
                                    payload: {
                                        headers: [],
                                        body: {
                                            data:
                                                Buffer
                                                    .from(
                                                        "transaction",
                                                    )
                                                    .toString(
                                                        "base64",
                                                    ),
                                        },
                                    },
                                },
                            }),
                    },
                },
            } as any;

            const result =
                await performIncrementalSync(
                    gmail,
                    {
                        id: "account-1",
                        userId: "user-1",
                        email: "user@gmail.com",
                        refreshToken:
                            "refresh",
                        historyId: "history-10",
                    } as any,
                    "user-1",
                );

            expect(
                result.fetched,
            ).toBe(2);

            expect(
                result.transactionsCreated,
            ).toBe(2);

            expect(
                mocks.gmailAccountUpdate,
            ).toHaveBeenCalledWith({
                where: {
                    id: "account-1",
                },
                data: expect.objectContaining({
                    historyId:
                        "history-20",
                }),
            });
        });

        it("deduplicates message IDs from history", async () => {

            const gmail = {
                users: {
                    history: {
                        list: vi.fn()
                            .mockResolvedValue({
                                data: {
                                    historyId:
                                        "history-20",
                                    history: [
                                        {
                                            messagesAdded: [
                                                {
                                                    message: {
                                                        id: "same",
                                                    },
                                                },
                                            ],
                                        },
                                        {
                                            messagesAdded: [
                                                {
                                                    message: {
                                                        id: "same",
                                                    },
                                                },
                                            ],
                                        },
                                    ],
                                },
                            }),
                    },

                    messages: {
                        get: vi.fn()
                            .mockResolvedValue({
                                data: {
                                    payload: {
                                        headers: [],
                                        body: {
                                            data:
                                                Buffer
                                                    .from(
                                                        "test",
                                                    )
                                                    .toString(
                                                        "base64",
                                                    ),
                                        },
                                    },
                                },
                            }),
                    },
                },
            } as any;

            const result =
                await performIncrementalSync(
                    gmail,
                    {
                        id: "account-1",
                        userId: "user-1",
                        email: "user@gmail.com",
                        refreshToken:
                            "refresh",
                        historyId: "history-10",
                    } as any,
                    "user-1",
                );

            expect(
                result.fetched,
            ).toBe(1);

            expect(
                mocks.ingestGmailEmail,
            ).toHaveBeenCalledTimes(1);
        });

        it("rejects when historyId is missing", async () => {

            await expect(
                performIncrementalSync(
                    {} as any,
                    {
                        id: "account-1",
                        userId: "user-1",
                        email: "user@gmail.com",
                        refreshToken:
                            "refresh",
                        historyId: null,
                    } as any,
                    "user-1",
                ),
            ).rejects.toThrow(
                "Gmail history expired",
            );
        });

        it("treats a 404 history response as expired", async () => {

            const gmail = {
                users: {
                    history: {
                        list: vi.fn()
                            .mockRejectedValue({
                                code: 404,
                            }),
                    },
                },
            } as any;

            await expect(
                performIncrementalSync(
                    gmail,
                    {
                        id: "account-1",
                        userId: "user-1",
                        email: "user@gmail.com",
                        refreshToken:
                            "refresh",
                        historyId: "history-10",
                    } as any,
                    "user-1",
                ),
            ).rejects.toThrow(
                "Gmail history expired",
            );
        });
    });

    describe("syncMailbox", () => {

        it("performs an initial sync when historyId is missing", async () => {

            mocks.createGmailClient
                .mockReturnValue({
                    users: {
                        messages: {
                            list: vi.fn()
                                .mockResolvedValue({
                                    data: {
                                        messages: [],
                                    },
                                }),
                            get: vi.fn(),
                        },
                        getProfile: vi.fn()
                            .mockResolvedValue({
                                data: {
                                    historyId:
                                        "history-1",
                                },
                            }),
                    },
                });

            const result =
                await syncMailbox(
                    "user-1",
                    {},
                );

            expect(
                result.fetched,
            ).toBe(0);

            expect(
                mocks.createGmailClient,
            ).toHaveBeenCalledWith(
                "refresh-token",
            );
        });

        it("returns immediately when a sync is already running", async () => {

            mocks.getConnectedGmailAccount
                .mockImplementation(
                    () =>
                        new Promise(
                            resolve =>
                                setTimeout(
                                    () =>
                                        resolve({
                                            id:
                                                "account-1",
                                            userId:
                                                "user-1",
                                            email:
                                                "user@gmail.com",
                                            refreshToken:
                                                "refresh",
                                            historyId:
                                                null,
                                        }),
                                    50,
                                ),
                        ),
                );

            mocks.createGmailClient
                .mockReturnValue({
                    users: {
                        messages: {
                            list: vi.fn()
                                .mockResolvedValue({
                                    data: {
                                        messages: [],
                                    },
                                }),
                        },

                        getProfile: vi.fn()
                            .mockResolvedValue({
                                data: {
                                    historyId:
                                        "history-1",
                                },
                            }),
                    },
                });

            const first =
                syncMailbox(
                    "user-1",
                    {},
                );

            const second =
                await syncMailbox(
                    "user-1",
                    {},
                );

            expect(second).toMatchObject({
                fetched: 0,
                transactionsCreated: 0,
                duplicates: 0,
                skipped: 0,
                nextPageToken: null,
            });

            await first;
        });
    });
});