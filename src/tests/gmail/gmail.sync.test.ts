import {beforeEach, describe, expect, it, vi,} from "vitest";

import {
    performIncrementalSync,
    performInitialSync,
    processMessage,
    syncMailbox,
} from "../../modules/email/gmail/gmail.sync";
import {GmailReconnectRequiredError} from "../../error/GmailReconnectRequiredError";

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

const createGmailAuthError = () => {
    const error = new Error("Invalid grant") as Error & {
        response?: {
            status?: number;
        };
        code?: number;
    };

    error.code = 401;

    return error;
};

const createGmailMessage = ({
                                id,
                            }: {
    id: string;
}) => ({
    id,
    internalDate: String(Date.now()),
    payload: {
        headers: [
            {
                name: "From",
                value: "alerts@axis.bank.in",
            },
            {
                name: "Subject",
                value: "Transaction alert",
            },
        ],
        body: {
            data: "",
        },
        parts: [],
    },
});

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

    // ---------------------------------------------------------------------
    // processMessage
    // ---------------------------------------------------------------------

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
                transactionId:
                    "transaction-1",
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
                    body:
                        "Rs. 500 has been debited",
                    receivedAt:
                        expect.any(Date),
                }),
            );
        });

        it("extracts text/plain from multipart messages", async () => {

            const gmail = {
                users: {
                    messages: {
                        get: vi.fn()
                            .mockResolvedValue({
                                data: {
                                    payload: {
                                        headers: [],
                                        parts: [
                                            {
                                                mimeType:
                                                    "text/plain",
                                                body: {
                                                    data:
                                                        Buffer
                                                            .from(
                                                                "plain text body",
                                                            )
                                                            .toString(
                                                                "base64",
                                                            ),
                                                },
                                            },
                                            {
                                                mimeType:
                                                    "text/html",
                                                body: {
                                                    data:
                                                        Buffer
                                                            .from(
                                                                "<p>html body</p>",
                                                            )
                                                            .toString(
                                                                "base64",
                                                            ),
                                                },
                                            },
                                        ],
                                    },
                                },
                            }),
                    },
                },
            } as any;

            await processMessage(
                gmail,
                "user-1",
                "message-1",
            );

            expect(
                mocks.ingestGmailEmail,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    body:
                        "plain text body",
                }),
            );
        });

        it("uses HTML when no plain text body exists", async () => {
            const gmail = {
                users: {
                    messages: {
                        get: vi.fn().mockResolvedValue({
                            data: {
                                payload: {
                                    headers: [],
                                    parts: [
                                        {
                                            mimeType: "text/html",
                                            body: {
                                                data: Buffer
                                                    .from("<p>html body</p>")
                                                    .toString("base64"),
                                            },
                                        },
                                    ],
                                },
                            },
                        }),
                    },
                },
            } as any;

            await processMessage(
                gmail,
                "user-1",
                "message-1",
            );

            expect(
                mocks.ingestGmailEmail,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "html body",
                }),
            );
        });
    });

    // ---------------------------------------------------------------------
    // performInitialSync
    // ---------------------------------------------------------------------

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

            expect(result.fetched)
                .toBe(2);

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
                data:
                    expect.objectContaining({
                        historyId:
                            "history-100",
                        lastSyncAt:
                            expect.any(Date),
                    }),
            });
        });

        it("uses the Gmail query and requested page size", async () => {

            const list =
                vi.fn()
                    .mockResolvedValue({
                        data: {
                            messages: [],
                        },
                    });

            const gmail = {
                users: {
                    messages: {
                        list,
                    },

                    getProfile:
                        vi.fn()
                            .mockResolvedValue({
                                data: {
                                    historyId:
                                        "history-1",
                                },
                            }),
                },
            } as any;

            await performInitialSync(
                gmail,
                {
                    id: "account-1",
                    userId: "user-1",
                    email: "user@gmail.com",
                    refreshToken: "refresh",
                    historyId: null,
                } as any,
                "user-1",
                {
                    maxResults: 25,
                    pageToken:
                        "page-token",
                },
            );

            expect(list)
                .toHaveBeenCalledWith({
                    userId: "me",
                    q:
                        "{from:alerts@axis.bank.in from:alerts@hdfcbank.bank.in} newer_than:30d",
                    maxResults: 25,
                    pageToken:
                        "page-token",
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

        it("throws when Gmail does not return a historyId", async () => {

            const gmail = {
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
                            data: {},
                        }),
                },
            } as any;

            await expect(
                performInitialSync(
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
                ),
            ).rejects.toThrow(
                "Unable to determine Gmail historyId.",
            );

            expect(
                mocks.gmailAccountUpdate,
            ).not.toHaveBeenCalled();
        });

    });

    // ---------------------------------------------------------------------
    // performIncrementalSync
    // ---------------------------------------------------------------------

    describe("performIncrementalSync", () => {
        it("stops processing when a message fails and does not advance the checkpoint", async () => {
            mocks.ingestGmailEmail
                .mockRejectedValueOnce(
                    new Error("bad message"),
                );

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
                                            data: Buffer
                                                .from("test")
                                                .toString("base64"),
                                        },
                                    },
                                },
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
                        refreshToken: "refresh",
                        historyId: "history-10",
                    } as any,
                    "user-1",
                ),
            ).rejects.toThrow("bad message");

            expect(
                mocks.ingestGmailEmail,
            ).toHaveBeenCalledTimes(1);

            expect(
                mocks.gmailAccountUpdate,
            ).not.toHaveBeenCalled();
        });

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
                                                        id:
                                                            "message-1",
                                                    },
                                                },
                                                {
                                                    message: {
                                                        id:
                                                            "message-2",
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
                        historyId:
                            "history-10",
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
                data:
                    expect.objectContaining({
                        historyId:
                            "history-20",
                        lastSyncAt:
                            expect.any(Date),
                    }),
            });
        });

        it("uses the stored historyId as the incremental checkpoint", async () => {

            const historyList =
                vi.fn()
                    .mockResolvedValue({
                        data: {
                            historyId:
                                "history-200",
                            history: [],
                        },
                    });

            const gmail = {
                users: {
                    history: {
                        list: historyList,
                    },

                    messages: {
                        get: vi.fn(),
                    },
                },
            } as any;

            await performIncrementalSync(
                gmail,
                {
                    id: "account-1",
                    userId: "user-1",
                    email: "user@gmail.com",
                    refreshToken:
                        "refresh",
                    historyId:
                        "history-150",
                } as any,
                "user-1",
            );

            expect(historyList)
                .toHaveBeenCalledWith({
                    userId: "me",
                    startHistoryId:
                        "history-150",
                    pageToken:
                    undefined,
                });
        });

        it("advances the checkpoint to the latest Gmail historyId", async () => {

            const gmail = {
                users: {
                    history: {
                        list: vi.fn()
                            .mockResolvedValue({
                                data: {
                                    historyId:
                                        "history-200",
                                    history: [],
                                },
                            }),
                    },

                    messages: {
                        get: vi.fn(),
                    },
                },
            } as any;

            await performIncrementalSync(
                gmail,
                {
                    id: "account-1",
                    userId: "user-1",
                    email: "user@gmail.com",
                    refreshToken:
                        "refresh",
                    historyId:
                        "history-150",
                } as any,
                "user-1",
            );

            expect(
                mocks.gmailAccountUpdate,
            ).toHaveBeenCalledWith({
                where: {
                    id: "account-1",
                },
                data:
                    expect.objectContaining({
                        historyId:
                            "history-200",
                        lastSyncAt:
                            expect.any(Date),
                    }),
            });
        });

        it("does not ingest messages when history contains no messagesAdded", async () => {

            const gmail = {
                users: {
                    history: {
                        list: vi.fn()
                            .mockResolvedValue({
                                data: {
                                    historyId:
                                        "history-200",
                                    history: [
                                        {
                                            messagesDeleted: [
                                                {
                                                    message: {
                                                        id:
                                                            "deleted-1",
                                                    },
                                                },
                                            ],
                                        },
                                    ],
                                },
                            }),
                    },

                    messages: {
                        get: vi.fn(),
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
                        historyId:
                            "history-150",
                    } as any,
                    "user-1",
                );

            expect(
                result.fetched,
            ).toBe(0);

            expect(
                mocks.ingestGmailEmail,
            ).not.toHaveBeenCalled();

            expect(
                mocks.gmailAccountUpdate,
            ).toHaveBeenCalled();
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
                                                        id:
                                                            "same",
                                                    },
                                                },
                                            ],
                                        },
                                        {
                                            messagesAdded: [
                                                {
                                                    message: {
                                                        id:
                                                            "same",
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
                        historyId:
                            "history-10",
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

        it("processes multiple history pages", async () => {

            const historyList =
                vi.fn()
                    .mockResolvedValueOnce({
                        data: {
                            historyId:
                                "history-20",

                            history: [
                                {
                                    messagesAdded: [
                                        {
                                            message: {
                                                id:
                                                    "message-1",
                                            },
                                        },
                                    ],
                                },
                            ],

                            nextPageToken:
                                "page-2",
                        },
                    })
                    .mockResolvedValueOnce({
                        data: {
                            historyId:
                                "history-30",

                            history: [
                                {
                                    messagesAdded: [
                                        {
                                            message: {
                                                id:
                                                    "message-2",
                                            },
                                        },
                                    ],
                                },
                            ],
                        },
                    });

            const gmail = {
                users: {
                    history: {
                        list: historyList,
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
                        historyId:
                            "history-10",
                    } as any,
                    "user-1",
                );

            expect(
                result.fetched,
            ).toBe(2);

            expect(
                historyList,
            ).toHaveBeenCalledTimes(2);

            expect(
                historyList,
            ).toHaveBeenNthCalledWith(
                1,
                {
                    userId: "me",
                    startHistoryId:
                        "history-10",
                    pageToken:
                    undefined,
                },
            );

            expect(
                historyList,
            ).toHaveBeenNthCalledWith(
                2,
                {
                    userId: "me",
                    startHistoryId:
                        "history-10",
                    pageToken:
                        "page-2",
                },
            );

            expect(
                mocks.gmailAccountUpdate,
            ).toHaveBeenCalledWith({
                where: {
                    id: "account-1",
                },
                data:
                    expect.objectContaining({
                        historyId:
                            "history-30",
                    }),
            });
        });

        it("counts duplicates returned by ingestion", async () => {

            mocks.ingestGmailEmail
                .mockResolvedValueOnce({
                    status:
                        "duplicate",
                });

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
                                                        id:
                                                            "message-1",
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
                        historyId:
                            "history-10",
                    } as any,
                    "user-1",
                );

            expect(
                result.transactionsCreated,
            ).toBe(0);

            expect(
                result.duplicates,
            ).toBe(1);
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
                        historyId:
                            "history-10",
                    } as any,
                    "user-1",
                ),
            ).rejects.toThrow(
                "Gmail history expired",
            );
        });

    });

    // ---------------------------------------------------------------------
    // syncMailbox
    // ---------------------------------------------------------------------

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

                        getProfile:
                            vi.fn()
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

        it("performs incremental sync when historyId exists", async () => {

            mocks.getConnectedGmailAccount
                .mockResolvedValue({
                    id: "gmail-account-1",
                    userId: "user-1",
                    email: "user@gmail.com",
                    refreshToken:
                        "refresh-token",
                    historyId:
                        "history-100",
                });

            const historyList =
                vi.fn()
                    .mockResolvedValue({
                        data: {
                            historyId:
                                "history-110",
                            history: [],
                        },
                    });

            mocks.createGmailClient
                .mockReturnValue({
                    users: {
                        history: {
                            list:
                            historyList,
                        },

                        messages: {
                            get: vi.fn(),
                        },
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
                historyList,
            ).toHaveBeenCalledWith({
                userId: "me",
                startHistoryId:
                    "history-100",
                pageToken:
                undefined,
            });
        });

        it("falls back to initial sync when history has expired", async () => {

            mocks.getConnectedGmailAccount
                .mockResolvedValue({
                    id: "gmail-account-1",
                    userId: "user-1",
                    email: "user@gmail.com",
                    refreshToken:
                        "refresh-token",
                    historyId:
                        "history-expired",
                });

            const historyList =
                vi.fn()
                    .mockRejectedValue({
                        code: 404,
                    });

            const messagesList =
                vi.fn()
                    .mockResolvedValue({
                        data: {
                            messages: [],
                        },
                    });

            const getProfile =
                vi.fn()
                    .mockResolvedValue({
                        data: {
                            historyId:
                                "history-new",
                        },
                    });

            mocks.createGmailClient
                .mockReturnValue({
                    users: {
                        history: {
                            list:
                            historyList,
                        },

                        messages: {
                            list:
                            messagesList,
                            get:
                                vi.fn(),
                        },

                        getProfile,
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
                historyList,
            ).toHaveBeenCalledTimes(1);

            expect(
                messagesList,
            ).toHaveBeenCalledTimes(1);

            expect(
                getProfile,
            ).toHaveBeenCalledTimes(1);

            expect(
                mocks.gmailAccountUpdate,
            ).toHaveBeenCalledWith({
                where: {
                    id: "gmail-account-1",
                },
                data:
                    expect.objectContaining({
                        historyId:
                            "history-new",
                    }),
            });
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

                            get:
                                vi.fn(),
                        },

                        getProfile:
                            vi.fn()
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
                transactionsCreated:
                    0,
                duplicates: 0,
                skipped: 0,
                nextPageToken:
                    null,
            });

            await first;
        });

        it("uses the Gmail account refresh token to create the client", async () => {

            mocks.getConnectedGmailAccount
                .mockResolvedValue({
                    id: "account-1",
                    userId: "user-1",
                    email: "user@gmail.com",
                    refreshToken:
                        "my-refresh-token",
                    historyId: null,
                });

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

                        getProfile:
                            vi.fn()
                                .mockResolvedValue({
                                    data: {
                                        historyId:
                                            "history-1",
                                    },
                                }),
                    },
                });

            await syncMailbox(
                "user-1",
                {},
            );

            expect(
                mocks.createGmailClient,
            ).toHaveBeenCalledWith(
                "my-refresh-token",
            );
        });
        it("deletes the Gmail account and requires reconnect when authorization is revoked", async () => {
            mocks.getConnectedGmailAccount
                .mockResolvedValue({
                    id: "gmail-account-1",
                    userId: "user-1",
                    email: "user@gmail.com",
                    refreshToken: "refresh-token",
                    historyId: "history-123",
                });

            const historyList = vi.fn()
                .mockRejectedValue(
                    createGmailAuthError(),
                );

            mocks.createGmailClient
                .mockReturnValue({
                    users: {
                        history: {
                            list: historyList,
                        },

                        messages: {
                            get: vi.fn(),
                        },
                    },
                });

            await expect(
                syncMailbox("user-1"),
            ).rejects.toThrow(
                GmailReconnectRequiredError,
            );

            expect(
                mocks.gmailAccountDelete,
            ).toHaveBeenCalledWith({
                where: {
                    id: "gmail-account-1",
                },
            });
        });
    });

    describe("Gmail reconnect flow", () => {
        it("imports missed transactions after Gmail is reconnected", async () => {
            mocks.getConnectedGmailAccount
                .mockResolvedValue({
                    id: "gmail-account-2",
                    userId: "user-1",
                    email: "user@gmail.com",
                    refreshToken: "new-refresh-token",
                    historyId: null,
                });

            const messagesList = vi.fn()
                .mockResolvedValue({
                    data: {
                        messages: [
                            {id: "missed-transaction-1"},
                            {id: "missed-transaction-2"},
                        ],
                    },
                });

            const messagesGet = vi.fn()
                .mockImplementation(
                    async ({
                               id,
                           }: {
                        id: string;
                    }) => ({
                        data: createGmailMessage({id}),
                    }),
                );

            const getProfile = vi.fn()
                .mockResolvedValue({
                    data: {
                        historyId: "history-after-reconnect",
                    },
                });

            mocks.createGmailClient
                .mockReturnValue({
                    users: {
                        messages: {
                            list: messagesList,
                            get: messagesGet,
                        },

                        getProfile,
                    },
                });

            mocks.ingestGmailEmail
                .mockResolvedValueOnce({
                    status: "created",
                    transactionId: "transaction-1",
                })
                .mockResolvedValueOnce({
                    status: "created",
                    transactionId: "transaction-2",
                });

            const result = await syncMailbox(
                "user-1",
            );

            expect(messagesList)
                .toHaveBeenCalledWith({
                    userId: "me",
                    q:
                        "{from:alerts@axis.bank.in from:alerts@hdfcbank.bank.in} newer_than:30d",
                    maxResults: 50,
                    pageToken: undefined,
                });

            expect(messagesGet)
                .toHaveBeenCalledTimes(2);

            expect(
                mocks.ingestGmailEmail,
            ).toHaveBeenCalledTimes(2);

            expect(
                mocks.ingestGmailEmail,
            ).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({
                    userId: "user-1",
                    gmailMessageId:
                        "missed-transaction-1",
                }),
            );

            expect(
                mocks.ingestGmailEmail,
            ).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    userId: "user-1",
                    gmailMessageId:
                        "missed-transaction-2",
                }),
            );

            expect(result).toEqual(
                expect.objectContaining({
                    fetched: 2,
                    transactionsCreated: 2,
                    duplicates: 0,
                    skipped: 0,
                }),
            );

            expect(
                mocks.gmailAccountUpdate,
            ).toHaveBeenCalledWith({
                where: {
                    id: "gmail-account-2",
                },
                data: expect.objectContaining({
                    historyId:
                        "history-after-reconnect",
                    lastSyncAt:
                        expect.any(Date),
                }),
            });
        });
        it("imports missed transactions after Gmail is reconnected", async () => {
            mocks.getConnectedGmailAccount
                .mockResolvedValue({
                    id: "gmail-account-2",
                    userId: "user-1",
                    email: "user@gmail.com",
                    refreshToken: "new-refresh-token",
                    historyId: null,
                });

            const messagesList = vi.fn()
                .mockResolvedValue({
                    data: {
                        messages: [
                            {
                                id: "missed-transaction-1",
                            },
                            {
                                id: "missed-transaction-2",
                            },
                        ],
                    },
                });

            const messagesGet = vi.fn()
                .mockImplementation(
                    async ({
                               id,
                           }: {
                        id: string;
                    }) => ({
                        data: createGmailMessage({id}),
                    }),
                );

            const getProfile = vi.fn()
                .mockResolvedValue({
                    data: {
                        historyId:
                            "history-after-reconnect",
                    },
                });

            mocks.createGmailClient
                .mockReturnValue({
                    users: {
                        messages: {
                            list: messagesList,
                            get: messagesGet,
                        },

                        getProfile,
                    },
                });

            mocks.ingestGmailEmail
                .mockResolvedValueOnce({
                    status: "created",
                    transactionId: "transaction-1",
                })
                .mockResolvedValueOnce({
                    status: "created",
                    transactionId: "transaction-2",
                });

            const result = await syncMailbox(
                "user-1",
            );

            expect(messagesList)
                .toHaveBeenCalledWith({
                    userId: "me",
                    q:
                        "{from:alerts@axis.bank.in from:alerts@hdfcbank.bank.in} newer_than:30d",
                    maxResults: 50,
                    pageToken: undefined,
                });

            expect(messagesGet)
                .toHaveBeenCalledTimes(2);

            expect(
                mocks.ingestGmailEmail,
            ).toHaveBeenCalledTimes(2);

            expect(
                mocks.ingestGmailEmail,
            ).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({
                    userId: "user-1",
                    gmailMessageId:
                        "missed-transaction-1",
                }),
            );

            expect(
                mocks.ingestGmailEmail,
            ).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    userId: "user-1",
                    gmailMessageId:
                        "missed-transaction-2",
                }),
            );

            expect(result).toEqual(
                expect.objectContaining({
                    fetched: 2,
                    transactionsCreated: 2,
                    duplicates: 0,
                    skipped: 0,
                }),
            );

            expect(
                mocks.gmailAccountUpdate,
            ).toHaveBeenCalledWith({
                where: {
                    id: "gmail-account-2",
                },
                data: expect.objectContaining({
                    historyId:
                        "history-after-reconnect",
                    lastSyncAt:
                        expect.any(Date),
                }),
            });
        });
    });
});