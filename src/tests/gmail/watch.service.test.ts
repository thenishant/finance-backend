import {beforeEach, describe, expect, it, vi,} from "vitest";

import {startGmailWatch} from "../../modules/email/gmail/watch/watch.service";

const mocks = vi.hoisted(() => ({
    createGmailClient: vi.fn(),
    usersWatch: vi.fn(),
    gmailAccountUpdate: vi.fn(),
}));

vi.mock(
    "../../database/prisma",
    () => ({
        prisma: {
            gmailAccount: {
                update:
                    mocks.gmailAccountUpdate,
            },
        },
    }),
);

vi.mock(
    "../../modules/email/gmail/gmail.utils",
    () => ({
        createGmailClient:
            mocks.createGmailClient,
    }),
);

describe("startGmailWatch", () => {

    beforeEach(() => {
        vi.clearAllMocks();

        process.env.GMAIL_PUBSUB_TOPIC =
            "projects/test/topics/gmail";

        mocks.createGmailClient
            .mockReturnValue({
                users: {
                    watch: mocks.usersWatch,
                },
            });

        mocks.usersWatch
            .mockResolvedValue({
                data: {
                    historyId:
                        "current-history-id",

                    expiration:
                        String(
                            Date.now() +
                            7 * 24 * 60 * 60 * 1000,
                        ),
                },
            });

        mocks.gmailAccountUpdate
            .mockResolvedValue({});
    });

    it("initializes historyId on a brand-new account that has none yet", async () => {

        await startGmailWatch({
            id: "account-1",
            email: "user@gmail.com",
            refreshToken: "refresh-token",
            historyId: null,
        } as any);

        expect(
            mocks.gmailAccountUpdate,
        ).toHaveBeenCalledWith({
            where: {
                id: "account-1",
            },

            data: expect.objectContaining({
                historyId:
                    "current-history-id",
            }),
        });
    });

    it("does NOT overwrite an existing historyId on reconnect or routine watch renewal", async () => {

        /*
         * This is the checkpoint incremental sync needs to catch
         * up on everything that happened while disconnected (or
         * simply since the last sync). gmail.users.watch() always
         * returns the mailbox's current historyId, which must
         * never silently replace it here - otherwise a reconnect
         * or a routine watch renewal would jump the checkpoint
         * forward and permanently skip anything in between.
         */
        await startGmailWatch({
            id: "account-1",
            email: "user@gmail.com",
            refreshToken: "refresh-token",
            historyId:
                "checkpoint-before-disconnect",
        } as any);

        expect(
            mocks.gmailAccountUpdate,
        ).toHaveBeenCalledTimes(1);

        const call =
            mocks.gmailAccountUpdate
                .mock.calls[0][0];

        expect(call.where)
            .toEqual({
                id: "account-1",
            });

        expect(call.data)
            .not.toHaveProperty(
                "historyId",
            );

        expect(call.data.watchExpiresAt)
            .toEqual(
                expect.any(Date),
            );
    });

    it("throws when Gmail does not return a historyId or expiration", async () => {

        mocks.usersWatch
            .mockResolvedValue({
                data: {},
            });

        await expect(
            startGmailWatch({
                id: "account-1",
                email: "user@gmail.com",
                refreshToken: "refresh-token",
                historyId: null,
            } as any),
        ).rejects.toThrow(
            "Failed to start Gmail watch.",
        );

        expect(
            mocks.gmailAccountUpdate,
        ).not.toHaveBeenCalled();
    });
});
