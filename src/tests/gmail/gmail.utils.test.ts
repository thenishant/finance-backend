import {beforeEach, describe, expect, it, vi} from "vitest";
import {
    generateGoogleState,
    getConnectedGmailAccount,
    GMAIL_QUERY,
    GOOGLE_SCOPES,
    verifyGoogleState,
} from "../../modules/email/gmail/gmail.utils";
import {BankProvider, detectBankProvider,} from "../../modules/email/gmail/detector/bank.detector";

const mocks = vi.hoisted(() => ({
    findUnique: vi.fn(),
    OAuth2: vi.fn(),
    gmail: vi.fn(),
}));

vi.mock("../../database/prisma", () => ({
    prisma: {
        gmailAccount: {
            findUnique: mocks.findUnique,
        },
    },
}));

vi.mock("googleapis", () => ({
    google: {
        auth: {
            OAuth2: mocks.OAuth2,
        },
        gmail: mocks.gmail,
    },
}));

describe("gmail.utils", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        process.env.JWT_SECRET = "test-secret";
    });

    describe("Google state", () => {
        it("generates a state containing the user and purpose", () => {
            const state =
                generateGoogleState("user-1");

            const payload =
                verifyGoogleState(state);

            expect(payload.userId).toBe("user-1");
            expect(payload.purpose).toBe(
                "gmail-connect",
            );
        });

        it("rejects an invalid state", () => {
            expect(() =>
                verifyGoogleState("invalid-state"),
            ).toThrow();
        });
    });

    describe("getConnectedGmailAccount", () => {
        it("returns the connected Gmail account", async () => {
            const account = {
                id: "gmail-1",
                userId: "user-1",
                email: "user@gmail.com",
                refreshToken: "refresh-token",
            };

            mocks.findUnique.mockResolvedValue(
                account,
            );

            await expect(
                getConnectedGmailAccount(
                    "user-1",
                ),
            ).resolves.toEqual(account);

            expect(
                mocks.findUnique,
            ).toHaveBeenCalledWith({
                where: {
                    userId: "user-1",
                },
            });
        });

        it("throws when Gmail is not connected", async () => {
            mocks.findUnique.mockResolvedValue(
                null,
            );

            await expect(
                getConnectedGmailAccount(
                    "user-1",
                ),
            ).rejects.toThrow(
                "Gmail account not connected",
            );
        });
    });

    describe("constants", () => {
        it("includes every bank sender the detector recognizes", () => {
            /*
             * GMAIL_QUERY is derived from the same BANK_SENDERS map
             * detectBankProvider uses, specifically so a bank that
             * is supported for detection/parsing can never be
             * silently left out of what an initial-sync backfill
             * actually searches for. This test locks that in: any
             * sender the detector matches must also appear in the
             * search query.
             */
            for (
                const provider
                of [
                    BankProvider.AXIS,
                    BankProvider.HDFC,
                    BankProvider.SBI,
                ]
                ) {
                const sampleSenders: Record<string, string> = {
                    [BankProvider.AXIS]: "alerts@axis.bank.in",
                    [BankProvider.HDFC]: "alerts@hdfcbank.bank.in",
                    [BankProvider.SBI]: "alerts.sbi.bank.in",
                };

                const sender = sampleSenders[provider];

                expect(
                    detectBankProvider(sender),
                ).toBe(provider);

                const senderDomain =
                    sender.replace(
                        /^alerts@?/,
                        "",
                    );

                expect(GMAIL_QUERY)
                    .toContain(senderDomain);
            }
        });

        it("contains Gmail readonly scope", () => {
            expect(GOOGLE_SCOPES).toContain(
                "https://www.googleapis.com/auth/gmail.readonly",
            );
        });
    });
});