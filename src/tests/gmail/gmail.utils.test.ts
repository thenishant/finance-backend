import {beforeEach, describe, expect, it, vi} from "vitest";
import {
    generateGoogleState,
    getConnectedGmailAccount,
    GMAIL_QUERY,
    GOOGLE_SCOPES,
    verifyGoogleState,
} from "../../modules/email/gmail/gmail.utils";

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
        it("contains the expected Gmail query", () => {
            expect(GMAIL_QUERY).toContain(
                "alerts@axis.bank.in",
            );

            expect(GMAIL_QUERY).toContain(
                "hdfcbank.bank.in",
            );

            expect(GMAIL_QUERY).toContain(
                "newer_than:30d",
            );
        });

        it("contains Gmail readonly scope", () => {
            expect(GOOGLE_SCOPES).toContain(
                "https://www.googleapis.com/auth/gmail.readonly",
            );
        });
    });
});