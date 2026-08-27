import {beforeEach, describe, expect, it, vi,} from "vitest";

import {FinancialAccountType, TransactionType,} from "@prisma/client";
import {ingestGmailEmail} from "../../modules/email/gmail/ingestion/transaction.ingestion";

const mocks = vi.hoisted(() => ({
    transactionFindUnique: vi.fn(),
    financialAccountFindFirst: vi.fn(),
    transactionCreate: vi.fn(),
    transaction: vi.fn(),

    resolveTransactionMerchant: vi.fn(),
    postTransactionToLedger: vi.fn(),
    updateAnalytics: vi.fn(),

    parseEmail: vi.fn(),
    detectBankProvider: vi.fn(),
}));

vi.mock("../../database/prisma", () => ({
    prisma: {
        transaction: {
            findUnique: mocks.transactionFindUnique,
        },
        $transaction: mocks.transaction,
    },
}));

vi.mock(
    "../../modules/merchant/merchant.service",
    () => ({
        resolveTransactionMerchant:
        mocks.resolveTransactionMerchant,
    }),
);

vi.mock(
    "../../modules/ledger/ledger.service",
    () => ({
        postTransactionToLedger:
        mocks.postTransactionToLedger,
    }),
);

vi.mock(
    "../../modules/transactions/transaction.service",
    () => ({
        updateAnalytics:
        mocks.updateAnalytics,
    }),
);

vi.mock(
    "../../modules/email/gmail/parsers/parser.factory",
    () => ({
        parseEmail:
        mocks.parseEmail,
    }),
);

vi.mock(
    "../../modules/email/gmail/detector/bank.detector",
    () => ({
        BankProvider: {
            AXIS: "AXIS",
            HDFC: "HDFC",
            SBI: "SBI",
            UNKNOWN: "UNKNOWN",
        },
        detectBankProvider:
        mocks.detectBankProvider,
    }),
);

describe("ingestGmailEmail", () => {

    beforeEach(() => {

        vi.clearAllMocks();

        mocks.transaction.mockImplementation(
            async (callback: any) => {

                const tx = {
                    transaction: {
                        findUnique:
                        mocks.transactionFindUnique,
                        create:
                        mocks.transactionCreate,
                    },

                    financialAccount: {
                        findFirst:
                        mocks.financialAccountFindFirst,
                    },
                };

                return callback(tx);
            },
        );

        mocks.detectBankProvider.mockReturnValue(
            "HDFC",
        );

        mocks.parseEmail.mockReturnValue({
            amount: 1250,
            merchant: "Swiggy",
            type: TransactionType.EXPENSE,
            transactionDate:
                new Date("2026-08-25T10:00:00.000Z"),
            accountLast4: "1234",
            accountType:
            FinancialAccountType.BANK_ACCOUNT,
        });

        mocks.resolveTransactionMerchant
            .mockResolvedValue({
                merchantId: "merchant-1",
                merchantRaw: "Swiggy",
                merchantNormalized: "swiggy",
                categoryId: "category-1",
                categoryAssignmentSource: "AI",
                confidence: 0.95,
            });

        mocks.transactionFindUnique
            .mockResolvedValue(null);

        mocks.financialAccountFindFirst
            .mockResolvedValue({
                id: "account-1",
            });

        mocks.transactionCreate
            .mockResolvedValue({
                id: "transaction-1",
                type: TransactionType.EXPENSE,
                amount: 1250,
                date:
                    new Date(
                        "2026-08-25T10:00:00.000Z",
                    ),
                year: 2026,
                month: 8,
                sourceAccountId: "account-1",
            });
    });

    it("skips unsupported senders", async () => {

        mocks.detectBankProvider.mockReturnValue(
            "UNKNOWN",
        );

        const result =
            await ingestGmailEmail({
                userId: "user-1",
                gmailMessageId: "gmail-1",
                sender: "amazon@example.com",
                subject: "Order shipped",
                body: "Your order has shipped",
            });

        expect(result).toEqual({
            status: "unsupported",
        });

        expect(
            mocks.parseEmail,
        ).not.toHaveBeenCalled();

        expect(
            mocks.transaction,
        ).not.toHaveBeenCalled();
    });

    it("skips emails that are not transactions", async () => {

        mocks.parseEmail.mockReturnValue(null);

        const result =
            await ingestGmailEmail({
                userId: "user-1",
                gmailMessageId: "gmail-1",
                sender: "alerts@hdfcbank.bank.in",
                subject: "Statement",
                body: "Your statement is ready",
            });

        expect(result).toEqual({
            status: "not-a-transaction",
        });

        expect(
            mocks.resolveTransactionMerchant,
        ).not.toHaveBeenCalled();

        expect(
            mocks.transaction,
        ).not.toHaveBeenCalled();
    });

    it("creates a transaction from a valid email", async () => {

        const result =
            await ingestGmailEmail({
                userId: "user-1",
                gmailMessageId: "gmail-1",
                sender: "alerts@hdfcbank.bank.in",
                subject: "Rs. 1,250 debited",
                body: "Swiggy transaction",
            });

        expect(result).toEqual({
            status: "created",
            transactionId: "transaction-1",
        });

        expect(
            mocks.resolveTransactionMerchant,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "user-1",
                merchantRaw: "Swiggy",
                transactionType:
                TransactionType.EXPENSE,
                shouldCategorize: true,
            }),
        );

        expect(
            mocks.transactionCreate,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    userId: "user-1",
                    type: TransactionType.EXPENSE,
                    source: "GMAIL",
                    gmailMessageId: "gmail-1",
                    sourceAccountId: "account-1",
                }),
            }),
        );

        expect(
            mocks.postTransactionToLedger,
        ).toHaveBeenCalled();

        expect(
            mocks.updateAnalytics,
        ).toHaveBeenCalled();
    });

    it("creates a transaction without an account match", async () => {

        mocks.financialAccountFindFirst
            .mockResolvedValue(null);

        const result =
            await ingestGmailEmail({
                userId: "user-1",
                gmailMessageId: "gmail-2",
                sender: "alerts@hdfcbank.bank.in",
                subject: "Rs. 1,250 debited",
                body: "Swiggy transaction",
            });

        expect(result.status).toBe(
            "created",
        );

        expect(
            mocks.transactionCreate,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    sourceAccountId: null,
                    metadata: expect.objectContaining({
                        accountMatched: false,
                    }),
                }),
            }),
        );
    });

    it("detects duplicate Gmail message IDs", async () => {

        mocks.transactionFindUnique
            .mockResolvedValueOnce({
                id: "existing-transaction",
            });

        const result =
            await ingestGmailEmail({
                userId: "user-1",
                gmailMessageId: "gmail-duplicate",
                sender: "alerts@hdfcbank.bank.in",
                subject: "Rs. 1,250 debited",
                body: "Swiggy transaction",
            });

        expect(result).toEqual({
            status: "duplicate",
            transactionId:
                "existing-transaction",
        });

        expect(
            mocks.transactionCreate,
        ).not.toHaveBeenCalled();
    });

    it("detects duplicate fingerprints", async () => {

        mocks.transactionFindUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                id: "fingerprint-transaction",
            });

        const result =
            await ingestGmailEmail({
                userId: "user-1",
                gmailMessageId: "gmail-new",
                sender: "alerts@hdfcbank.bank.in",
                subject: "Rs. 1,250 debited",
                body: "Swiggy transaction",
            });

        expect(result).toEqual({
            status: "duplicate",
            transactionId:
                "fingerprint-transaction",
        });

        expect(
            mocks.transactionCreate,
        ).not.toHaveBeenCalled();
    });

    it("uses receivedAt when the parser has no transaction date", async () => {

        mocks.parseEmail.mockReturnValue({
            amount: 500,
            merchant: "Amazon",
            type: TransactionType.EXPENSE,
        });

        const receivedAt =
            new Date(
                "2026-08-20T12:00:00.000Z",
            );

        mocks.transactionCreate.mockResolvedValue({
            id: "transaction-2",
            type: TransactionType.EXPENSE,
            amount: 500,
            date: receivedAt,
            year: 2026,
            month: 8,
        });

        const result =
            await ingestGmailEmail({
                userId: "user-1",
                gmailMessageId: "gmail-3",
                sender: "alerts@hdfcbank.bank.in",
                subject: "Rs. 500 debited",
                body: "Amazon",
                receivedAt,
            });

        expect(result.status).toBe("created",
        );

        expect(
            mocks.transactionCreate,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    date: receivedAt,
                    year: 2026,
                    month: 8,
                }),
            }),
        );
    });
});
