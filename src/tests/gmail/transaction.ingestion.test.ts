import {beforeEach, describe, expect, it, vi,} from "vitest";

import {CategoryAssignmentSource, FinancialAccountType, TransactionSource, TransactionType,} from "@prisma/client";

import {parseAxisEmail} from "../../modules/email/gmail/parsers/axis/axis.parser";

import {ingestGmailEmail} from "../../modules/email/gmail/ingestion/transaction.ingestion";

import {BankProvider} from "../../modules/email/gmail/detector/bank.detector";

import {createISTDate} from "../../date";

const mocks = vi.hoisted(() => ({
    transactionFindUnique: vi.fn(),
    transactionFindFirst: vi.fn(),
    transactionCreate: vi.fn(),
    transactionUpdate: vi.fn(),

    financialAccountFindFirst: vi.fn(),

    gmailMessageFindUnique: vi.fn(),
    gmailMessageUpdate: vi.fn(),
    gmailMessageDelete: vi.fn(),

    transaction: vi.fn(),

    resolveTransactionMerchant:
        vi.fn(),

    postTransactionToLedger:
        vi.fn(),

    updateAnalytics:
        vi.fn(),

    parseEmail:
        vi.fn(),

    detectBankProvider:
        vi.fn(),
}));
vi.mock(
    "../../database/prisma",
    () => ({
        prisma: {
            transaction: {
                findUnique:
                mocks.transactionFindUnique,
            },

            gmailMessage: {
                findUnique:
                mocks.gmailMessageFindUnique,

                update:
                mocks.gmailMessageUpdate,

                delete:
                mocks.gmailMessageDelete,
            },

            $transaction:
            mocks.transaction,
        },
    }),
);

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

const gmailMessage = {
    id: "stored-message-1",
    gmailMessageId: "gmail-message-1",
    sender: "alerts@axis.bank.in",
    subject: "Debit Alert",
    body: "₹500 debited",
    processed: false,
    receivedAt: new Date(),
    gmailAccount: {
        userId: "user-1",
    },
};

describe("Axis email parser / Gmail ingestion", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.gmailMessageFindUnique
            .mockResolvedValue(gmailMessage);
        /*
         * Default transaction implementation.
         *
         * Individual tests can override this when
         * they need a particular transaction state.
         */
        mocks.transaction.mockImplementation(
            async (callback: any) => {
                return callback({
                    transaction: {
                        findUnique:
                        mocks.transactionFindUnique,

                        create:
                        mocks.transactionCreate,

                        update:
                        mocks.transactionUpdate,
                    },

                    financialAccount: {
                        findFirst:
                        mocks.financialAccountFindFirst,
                    },
                });
            },
        );

        mocks.transactionFindUnique
            .mockResolvedValue(null);

        mocks.financialAccountFindFirst
            .mockResolvedValue(null);

        mocks.transactionCreate
            .mockResolvedValue({
                id: "transaction-id",
                year: 2026,
                month: 8,
                type: TransactionType.EXPENSE,
            });

        mocks.transactionUpdate
            .mockResolvedValue({
                id: "transaction-id",
                year: 2026,
                month: 8,
                type: TransactionType.EXPENSE,
            });

        mocks.postTransactionToLedger
            .mockResolvedValue(undefined);

        mocks.updateAnalytics
            .mockResolvedValue(undefined);
    });

    /* ---------------------------------------------------------------------- */
    /*                              Parser tests                              */
    /* ---------------------------------------------------------------------- */

    it("parses a standard bank account debit", () => {
        const subject =
            "INR 160.00 was debited from your A/c no. XX0999.";

        const body = `
            28-08-2026
            Dear Nishant Sharma,

            Here's the summary of your transaction:

            Amount Debited:
            INR 160.00

            Account Number:
            XX0999

            Date & Time:
            28-08-26, 20:40:27 IST

            Transaction Info:
            UPI/P2M/660615862577/SHAKILA THAPA

            If this transaction was not initiated by you:
            To block UPI:
            SMS BLOCKUPI
        `;

        const result =
            parseAxisEmail(
                subject,
                body,
            );

        expect(result).not.toBeNull();

        expect(result?.amount)
            .toBe(160);

        expect(result?.type)
            .toBe(
                TransactionType.EXPENSE,
            );

        expect(result?.merchant)
            .toBe(
                "SHAKILA THAPA",
            );

        expect(result?.resolveMerchant)
            .toBe(true);

        expect(result?.accountLast4)
            .toBe("0999");

        expect(result?.accountType)
            .toBe(
                FinancialAccountType.BANK_ACCOUNT,
            );

        expect(
            result?.transactionDate,
        ).toBeDefined();
    });

    it("parses a standard bank account credit", () => {
        const subject =
            "INR 110.00 was credited to your A/c no. XX0999.";

        const body = `
            27-08-2026
            Dear Nishant Sharma,

            Here's the summary of your transaction:

            Amount Credited:
            INR 110.00

            Account Number:
            XX0999

            Date & Time:
            27-08-26, 08:29:30 IST

            Transaction Info:
            ACH-CR-BIKAJI FOODS INT LT.

            Feel free to contact us.
            Regards,
            Axis Bank Ltd.
        `;

        const result =
            parseAxisEmail(
                subject,
                body,
            );

        expect(result).not.toBeNull();

        expect(result?.amount)
            .toBe(110);

        expect(result?.type)
            .toBe(
                TransactionType.INCOME,
            );

        expect(result?.merchant)
            .toBe(
                "ACH-CR-BIKAJI FOODS INT LT",
            );

        expect(result?.resolveMerchant)
            .toBe(true);

        expect(result?.accountLast4)
            .toBe("0999");

        expect(result?.accountType)
            .toBe(
                FinancialAccountType.BANK_ACCOUNT,
            );

        expect(
            result?.transactionDate,
        ).toBeDefined();
    });

    it("parses a Burgundy debit", () => {
        const subject =
            "Debit transaction alert for Axis Bank A/c";

        const body = `
            27-08-2026
            Dear Nishant Sharma,

            Thank you for banking with us.

            We wish to inform you that your A/c no. XX0999
            has been debited with INR 14500.00
            on 27-08-2026 08:30:06 IST
            by ACH-DR-Indian Clearing Cor.

            To check your available balance, please click here.

            Please SMS BLOCKALL.

            For details, please contact your Burgundy RM.

            Always open to help you.

            Regards,
            Axis Bank Ltd.
        `;

        const result =
            parseAxisEmail(
                subject,
                body,
            );

        expect(result).not.toBeNull();

        expect(result?.amount)
            .toBe(14500);

        expect(result?.type)
            .toBe(
                TransactionType.EXPENSE,
            );

        expect(result?.merchant)
            .toBe(
                "ACH-DR-Indian Clearing Cor",
            );

        expect(result?.resolveMerchant)
            .toBe(true);

        expect(result?.accountLast4)
            .toBe("0999");

        expect(result?.accountType)
            .toBe(
                FinancialAccountType.BANK_ACCOUNT,
            );

        expect(
            result?.transactionDate,
        ).toBeDefined();
    });

    it("parses a Burgundy credit", () => {
        const subject =
            "Credit transaction alert for Axis Bank A/c";

        const body = `
            27-08-2026
            Dear Nishant Sharma,

            Thank you for banking with us.

            We wish to inform you that your A/c no. XX0999
            has been credited with INR 110.00
            on 27-08-2026 at 08:29:30 IST
            by ACH-CR-BIKAJI FOODS INT LT.

            To check your available balance, please click here.

            For details, please contact your Burgundy RM.

            Always open to help you.

            Regards,
            Axis Bank Ltd.
        `;

        const result =
            parseAxisEmail(
                subject,
                body,
            );

        expect(result).not.toBeNull();

        expect(result?.amount)
            .toBe(110);

        expect(result?.type)
            .toBe(
                TransactionType.INCOME,
            );

        expect(result?.merchant)
            .toBe(
                "ACH-CR-BIKAJI FOODS INT LT",
            );

        expect(result?.resolveMerchant)
            .toBe(true);

        expect(result?.accountLast4)
            .toBe("0999");

        expect(result?.accountType)
            .toBe(
                FinancialAccountType.BANK_ACCOUNT,
            );

        expect(
            result?.transactionDate,
        ).toBeDefined();
    });

    it("parses an Axis credit card transaction", () => {
        const subject =
            "INR 12 spent on credit card no. XX1256";

        const body = `
            28-08-2026
            Dear Nishant Sharma,

            Here's the summary of your Axis Bank Credit Card Transaction:

            Transaction Amount:
            INR 12

            Merchant Name:
            ASSPL

            Axis Bank Credit Card No.
            XX1256

            Date & Time:
            28-08-2026, 07:59:41 IST

            Available Limit:
            INR 1143946

            Total Credit Limit:
            INR 1155000

            If this transaction was not initiated by you:
            SMS BLOCK 1256
        `;

        const result =
            parseAxisEmail(
                subject,
                body,
            );

        expect(result).not.toBeNull();

        expect(result?.amount)
            .toBe(12);

        expect(result?.type)
            .toBe(
                TransactionType.EXPENSE,
            );

        expect(result?.merchant)
            .toBe("ASSPL");

        expect(result?.resolveMerchant)
            .toBe(true);

        expect(result?.accountLast4)
            .toBe("1256");

        expect(result?.accountType)
            .toBe(
                FinancialAccountType.CREDIT_CARD,
            );

        expect(
            result?.transactionDate,
        ).toBeDefined();
    });

    it("ignores Axis autopay emails", () => {
        const result =
            parseAxisEmail(
                "INR 2,000 autopay reminder",
                "Amount Debited: INR 2,000",
            );

        expect(result)
            .toBeNull();
    });

    it("ignores Axis reminder emails", () => {
        const result =
            parseAxisEmail(
                "INR 2,000 payment reminder",
                "Amount Debited: INR 2,000",
            );

        expect(result)
            .toBeNull();
    });

    it("returns null for an unsupported Axis format", () => {
        const result =
            parseAxisEmail(
                "Your Axis Bank statement is ready",
                `
                    Dear Customer,
                    Your monthly statement is now available.
                `,
            );

        expect(result)
            .toBeNull();
    });

    /* ---------------------------------------------------------------------- */
    /*                          Successful ingestion                           */
    /* ---------------------------------------------------------------------- */

    it("assigns categoryId to Gmail imported non-transfer transactions", async () => {
        const userId =
            "test-user-id";

        const categoryId =
            "test-category-id";

        const merchantId =
            "test-merchant-id";

        mocks.detectBankProvider
            .mockReturnValue(
                BankProvider.AXIS,
            );

        mocks.parseEmail
            .mockReturnValue({
                amount: 350,

                type:
                TransactionType.EXPENSE,

                merchant:
                    "MADHU WINES",

                accountLast4:
                    "1256",

                accountType:
                FinancialAccountType.CREDIT_CARD,

                transactionDate:
                    new Date(
                        "2026-08-30T17:21:42+05:30",
                    ),

                resolveMerchant: true,
            });

        mocks.resolveTransactionMerchant
            .mockResolvedValue({
                merchant: {
                    id: merchantId,
                    name: "Madhu Wines",
                },

                merchantId,

                merchantRaw:
                    "MADHU WINES",

                merchantNormalized:
                    "Madhu Wines",

                category: {
                    id: categoryId,
                    name: "Food & Dining",
                    type:
                    TransactionType.EXPENSE,
                },

                categoryId,

                categoryAssignmentSource:
                CategoryAssignmentSource.AI,

                confidence: 0.95,
            });

        mocks.financialAccountFindFirst
            .mockResolvedValue({
                id: "account-id",
            });

        mocks.transactionCreate
            .mockResolvedValue({
                id: "transaction-id",
                userId,

                type:
                TransactionType.EXPENSE,

                amount: 350,

                date:
                    new Date(
                        "2026-08-30T17:21:42+05:30",
                    ),

                year: 2026,
                month: 8,

                merchantId,

                merchantRaw:
                    "MADHU WINES",

                merchantNormalized:
                    "Madhu Wines",

                categoryId,

                categoryAssignmentSource:
                CategoryAssignmentSource.AI,

                aiCategoryConfidence:
                    0.95,

                source:
                TransactionSource.GMAIL,

                sourceAccountId:
                    "account-id",
            });

        const result =
            await ingestGmailEmail({
                userId,

                gmailMessageId:
                    "gmail-category-test-1",

                sender:
                    "alerts@axis.bank.in",

                subject:
                    "INR 350.00 was debited from your A/c.",

                body: `
                    Amount Debited: INR 350.00
                    Account Number: XX1256
                    Transaction Info: MADHU WINES
                `,

                receivedAt:
                    new Date(
                        "2026-08-30T17:21:42+05:30",
                    ),
            });

        expect(result.status)
            .toBe("created");

        expect(
            mocks.resolveTransactionMerchant,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                userId,
                merchantRaw:
                    "MADHU WINES",
                transactionType:
                TransactionType.EXPENSE,
                shouldCategorize: true,
                requireCategory: false,
            }),
        );

        expect(
            mocks.transactionCreate,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                data:
                    expect.objectContaining({
                        categoryId,

                        categoryAssignmentSource:
                        CategoryAssignmentSource.AI,

                        aiCategoryConfidence:
                            0.95,
                    }),
            }),
        );
    });

    /* ---------------------------------------------------------------------- */
    /*                            Failure behavior                             */
    /* ---------------------------------------------------------------------- */
    it("creates Gmail non-transfer transaction even when categorization fails", async () => {
        const userId = "user-1";
        const merchantId = "merchant-1";

        mocks.detectBankProvider.mockReturnValue(
            BankProvider.AXIS,
        );

        mocks.parseEmail.mockReturnValue({
            amount: 350,
            type: TransactionType.EXPENSE,
            merchant: "MADHU WINES",
            resolveMerchant: true,
            accountLast4: "1256",
            accountType:
            FinancialAccountType.CREDIT_CARD,
            transactionDate: new Date(
                "2026-08-30T17:21:42+05:30",
            ),
        });

        /*
         * Simulate AI categorization failure.
         *
         * Merchant resolution succeeded, but there is
         * no category available because the AI failed.
         */
        mocks.resolveTransactionMerchant.mockResolvedValue({
            merchant: {
                id: merchantId,
                name: "Madhu Wines",
            },

            merchantId,

            merchantRaw:
                "MADHU WINES",

            merchantNormalized:
                "Madhu Wines",

            category: null,

            categoryId: null,

            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,

            confidence: 0,
        });

        mocks.transactionFindUnique.mockResolvedValue(
            null,
        );

        mocks.financialAccountFindFirst.mockResolvedValue({
            id: "account-id",
        });

        mocks.transaction.mockImplementation(
            async (callback: any) =>
                callback({
                    transaction: {
                        findUnique:
                        mocks.transactionFindUnique,

                        create:
                        mocks.transactionCreate,

                        update: vi.fn(),
                    },

                    financialAccount: {
                        findFirst:
                        mocks.financialAccountFindFirst,
                    },
                }),
        );

        mocks.transactionCreate.mockResolvedValue({
            id: "transaction-id",

            userId,

            type:
            TransactionType.EXPENSE,

            amount: 350,

            date: new Date(
                "2026-08-30T17:21:42+05:30",
            ),

            year: 2026,

            month: 8,

            merchantId,

            merchantRaw:
                "MADHU WINES",

            merchantNormalized:
                "Madhu Wines",

            /*
             * This is the important assertion:
             * transaction is allowed to exist without
             * a category when AI categorization fails.
             */
            categoryId: null,

            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,

            aiCategoryConfidence: 0,

            source:
            TransactionSource.GMAIL,

            sourceAccountId:
                "account-id",
        });

        const result =
            await ingestGmailEmail({
                userId,

                gmailMessageId:
                    "gmail-ai-failure-test",

                sender:
                    "alerts@axis.bank.in",

                subject:
                    "INR 350.00 was debited from your A/c.",

                body: `
                Amount Debited: INR 350.00
                Account Number: XX1256
                Transaction Info: MADHU WINES
            `,

                receivedAt:
                    new Date(
                        "2026-08-30T17:21:42+05:30",
                    ),
            });

        /*
         * AI failed, but ingestion must still succeed.
         */
        expect(result.status).toBe("created");

        /*
         * Most important regression assertion:
         * transactionCreate MUST have been called.
         */
        expect(
            mocks.transactionCreate,
        ).toHaveBeenCalled();

        expect(mocks.transactionCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    merchantId: "merchant-1",
                    merchantRaw: "MADHU WINES",
                    categoryId: null,
                    categoryAssignmentSource: "NONE",
                    aiCategoryConfidence: 0,
                    source: "GMAIL",
                    sourceAccountId: "account-id",
                    gmailMessageId: "gmail-ai-failure-test",
                }),
            }),
        );
    });

    it("persists Gmail non-transfer transactions when categorization fails", async () => {
        mocks.detectBankProvider
            .mockReturnValue(
                BankProvider.AXIS,
            );

        mocks.parseEmail
            .mockReturnValue({
                amount: 350,

                type:
                TransactionType.EXPENSE,

                merchant:
                    "MADHU WINES",

                resolveMerchant: true,

                accountLast4:
                    "1256",

                accountType:
                FinancialAccountType.CREDIT_CARD,

                transactionDate:
                    new Date(
                        "2026-08-30T17:21:42+05:30",
                    ),
            });

        mocks.resolveTransactionMerchant
            .mockResolvedValue({
                merchant: {
                    id: "merchant-1",
                    name: "Madhu Wines",
                },

                merchantId:
                    "merchant-1",

                merchantRaw:
                    "MADHU WINES",

                merchantNormalized:
                    "Madhu Wines",

                category: null,

                categoryId: null,

                categoryAssignmentSource:
                CategoryAssignmentSource.NONE,

                confidence: 0,
            });

        mocks.financialAccountFindFirst
            .mockResolvedValue({
                id: "account-1",
            });

        mocks.transactionCreate
            .mockResolvedValue({
                id: "transaction-1",

                year: 2026,
                month: 8,

                type:
                TransactionType.EXPENSE,
            });

        const result =
            await ingestGmailEmail({
                userId:
                    "user-1",

                gmailMessageId:
                    "gmail-no-category",

                sender:
                    "alerts@axis.bank.in",

                subject:
                    "INR 350.00 was debited from your A/c.",

                body:
                    "Amount Debited: INR 350.00",

                receivedAt:
                    new Date(
                        "2026-08-30T17:21:42+05:30",
                    ),
            });

        /*
         * The transaction must be created.
         */
        expect(result.status)
            .toBe("created");

        expect(
            mocks.transactionCreate,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                data:
                    expect.objectContaining({
                        merchantId:
                            "merchant-1",

                        merchantRaw:
                            "MADHU WINES",

                        categoryId:
                            null,

                        categoryAssignmentSource:
                        CategoryAssignmentSource.NONE,

                        source:
                        TransactionSource.GMAIL,
                    }),
            }),
        );

        /*
         * The ingestion layer must explicitly
         * opt out of requiring a category.
         */
        expect(
            mocks.resolveTransactionMerchant,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                shouldCategorize: true,
                requireCategory: false,
            }),
        );
    });

    it("still posts ledger and analytics when categorization fails", async () => {
        mocks.detectBankProvider
            .mockReturnValue(
                BankProvider.AXIS,
            );

        mocks.parseEmail
            .mockReturnValue({
                amount: 350,

                type:
                TransactionType.EXPENSE,

                merchant:
                    "MADHU WINES",

                accountLast4:
                    "1256",

                accountType:
                FinancialAccountType.CREDIT_CARD,

                transactionDate:
                    new Date(
                        "2026-08-30T17:21:42+05:30",
                    ),
            });

        mocks.resolveTransactionMerchant
            .mockResolvedValue({
                merchant: {
                    id: "merchant-1",
                    name: "Madhu Wines",
                },

                merchantId:
                    "merchant-1",

                merchantRaw:
                    "MADHU WINES",

                merchantNormalized:
                    "Madhu Wines",

                category: null,
                categoryId: null,

                categoryAssignmentSource:
                CategoryAssignmentSource.NONE,

                confidence: 0,
            });

        mocks.financialAccountFindFirst
            .mockResolvedValue({
                id: "account-1",
            });

        mocks.transactionCreate
            .mockResolvedValue({
                id: "transaction-1",
                year: 2026,
                month: 8,
                type:
                TransactionType.EXPENSE,
            });

        const result =
            await ingestGmailEmail({
                userId: "user-1",

                gmailMessageId:
                    "gmail-ledger-test",

                sender:
                    "alerts@axis.bank.in",

                subject:
                    "INR 350.00 was debited from your A/c.",

                body:
                    "Amount Debited: INR 350.00",

                receivedAt:
                    new Date(
                        "2026-08-30T17:21:42+05:30",
                    ),
            });

        expect(result.status)
            .toBe("created");

        expect(
            mocks.postTransactionToLedger,
        ).toHaveBeenCalled();

        expect(
            mocks.updateAnalytics,
        ).toHaveBeenCalledWith(
            expect.anything(),
            "user-1",
            2026,
            8,
            TransactionType.EXPENSE,
            expect.anything(),
            "increment",
        );
    });

    it("persists a transaction when merchant resolution also fails", async () => {
        mocks.detectBankProvider
            .mockReturnValue(
                BankProvider.AXIS,
            );

        mocks.parseEmail
            .mockReturnValue({
                amount: 500,

                type:
                TransactionType.EXPENSE,

                merchant:
                    "UNKNOWN MERCHANT",

                accountLast4:
                    "0999",

                accountType:
                FinancialAccountType.BANK_ACCOUNT,

                transactionDate:
                    new Date(
                        "2026-08-30T12:00:00+05:30",
                    ),
            });

        /*
         * This represents the final fallback returned
         * by resolveTransactionMerchant when merchant
         * resolution itself cannot produce a merchant.
         */
        mocks.resolveTransactionMerchant
            .mockResolvedValue({
                merchant: null,

                merchantId: null,

                merchantRaw:
                    "UNKNOWN MERCHANT",

                merchantNormalized:
                    "UNKNOWN MERCHANT",

                category: null,

                categoryId: null,

                categoryAssignmentSource:
                CategoryAssignmentSource.NONE,

                confidence: null,
            });

        mocks.transactionCreate
            .mockResolvedValue({
                id: "transaction-unknown-merchant",

                year: 2026,
                month: 8,

                type:
                TransactionType.EXPENSE,
            });

        const result =
            await ingestGmailEmail({
                userId: "user-1",

                gmailMessageId:
                    "gmail-unknown-merchant",

                sender:
                    "alerts@axis.bank.in",

                subject:
                    "INR 500 debited",

                body:
                    "Amount Debited: INR 500",

                receivedAt:
                    new Date(
                        "2026-08-30T12:00:00+05:30",
                    ),
            });

        expect(result.status)
            .toBe("created");

        expect(
            mocks.transactionCreate,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                data:
                    expect.objectContaining({
                        merchantId: null,

                        merchantRaw:
                            "UNKNOWN MERCHANT",

                        categoryId: null,

                        source:
                        TransactionSource.GMAIL,
                    }),
            }),
        );
    });

    /* ---------------------------------------------------------------------- */
    /*                              Transfers                                  */
    /* ---------------------------------------------------------------------- */

    it("allows Gmail transfers without a category", async () => {
        mocks.detectBankProvider
            .mockReturnValue(
                BankProvider.AXIS,
            );

        mocks.parseEmail
            .mockReturnValue({
                amount: 3000,

                type:
                TransactionType.TRANSFER,

                merchant:
                    "Credit Card Transfer",

                resolveMerchant: true,

                accountLast4:
                    "0999",

                accountType:
                FinancialAccountType.BANK_ACCOUNT,

                transactionDate:
                    new Date(
                        "2026-08-30T21:54:13+05:30",
                    ),
            });

        mocks.resolveTransactionMerchant
            .mockResolvedValue({
                merchant: {
                    id:
                        "merchant-transfer",

                    name:
                        "Credit Card Transfer",
                },

                merchantId:
                    "merchant-transfer",

                merchantRaw:
                    "Credit Card Transfer",

                merchantNormalized:
                    "Credit Card Transfer",

                category: null,

                categoryId: null,

                categoryAssignmentSource:
                CategoryAssignmentSource.NONE,

                confidence: 1,
            });

        mocks.financialAccountFindFirst
            .mockResolvedValue({
                id: "account-1",
            });

        mocks.transactionCreate
            .mockResolvedValue({
                id: "transaction-1",

                userId: "user-1",

                type:
                TransactionType.TRANSFER,

                amount: 3000,

                year: 2026,
                month: 8,

                categoryId: null,
            });

        const result =
            await ingestGmailEmail({
                userId: "user-1",

                gmailMessageId:
                    "gmail-transfer-test",

                sender:
                    "alerts@axis.bank.in",

                subject:
                    "Credit Card Transfer",

                body:
                    "Transfer",

                receivedAt:
                    new Date(
                        "2026-08-30T21:54:13+05:30",
                    ),
            });

        expect(result.status)
            .toBe("created");

        expect(
            mocks.transactionCreate,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                data:
                    expect.objectContaining({
                        type:
                        TransactionType.TRANSFER,

                        categoryId:
                            null,
                    }),
            }),
        );

        /*
         * Transfer should explicitly skip
         * categorization.
         */
        expect(
            mocks.resolveTransactionMerchant,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                shouldCategorize: false,
                requireCategory: false,
            }),
        );
    });

    /* ---------------------------------------------------------------------- */
    /*                             Idempotency                                 */
    /* ---------------------------------------------------------------------- */

    it("returns updated when the Gmail message already exists", async () => {
        mocks.detectBankProvider
            .mockReturnValue(
                BankProvider.AXIS,
            );

        mocks.parseEmail
            .mockReturnValue({
                amount: 350,

                type:
                TransactionType.EXPENSE,

                merchant:
                    "MADHU WINES",

                accountLast4:
                    "1256",

                accountType:
                FinancialAccountType.CREDIT_CARD,

                transactionDate:
                    new Date(
                        "2026-08-30T17:21:42+05:30",
                    ),
            });

        mocks.resolveTransactionMerchant
            .mockResolvedValue({
                merchant: {
                    id: "merchant-1",
                    name: "Madhu Wines",
                },

                merchantId:
                    "merchant-1",

                merchantRaw:
                    "MADHU WINES",

                merchantNormalized:
                    "Madhu Wines",

                category: null,

                categoryId: null,

                categoryAssignmentSource:
                CategoryAssignmentSource.NONE,

                confidence: 0,
            });

        /*
         * First findUnique = existing Gmail message.
         */
        mocks.transactionFindUnique
            .mockResolvedValueOnce({
                id: "existing-transaction",
            });

        mocks.transactionUpdate
            .mockResolvedValue({
                id:
                    "existing-transaction",
            });

        const result =
            await ingestGmailEmail({
                userId: "user-1",

                gmailMessageId:
                    "already-imported",

                sender:
                    "alerts@axis.bank.in",

                subject:
                    "INR 350 debited",

                body:
                    "Amount Debited: INR 350",

                receivedAt:
                    new Date(
                        "2026-08-30T17:21:42+05:30",
                    ),
            });

        expect(result.status)
            .toBe("updated");

        expect(
            mocks.transactionUpdate,
        ).toHaveBeenCalled();

        expect(
            mocks.transactionCreate,
        ).not.toHaveBeenCalled();
    });

    it("returns duplicate when the fingerprint already exists", async () => {
        mocks.detectBankProvider
            .mockReturnValue(
                BankProvider.AXIS,
            );

        mocks.parseEmail
            .mockReturnValue({
                amount: 350,

                type:
                TransactionType.EXPENSE,

                merchant:
                    "MADHU WINES",

                accountLast4:
                    "1256",

                accountType:
                FinancialAccountType.CREDIT_CARD,

                transactionDate:
                    new Date(
                        "2026-08-30T17:21:42+05:30",
                    ),
            });

        mocks.resolveTransactionMerchant
            .mockResolvedValue({
                merchant: {
                    id: "merchant-1",
                    name: "Madhu Wines",
                },

                merchantId:
                    "merchant-1",

                merchantRaw:
                    "MADHU WINES",

                merchantNormalized:
                    "Madhu Wines",

                category: null,

                categoryId: null,

                categoryAssignmentSource:
                CategoryAssignmentSource.NONE,

                confidence: 0,
            });

        /*
         * First findUnique = no Gmail message.
         * Second findUnique = fingerprint exists.
         */
        mocks.transactionFindUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                id: "existing-transaction",
            });

        const result =
            await ingestGmailEmail({
                userId: "user-1",

                gmailMessageId:
                    "new-gmail-message",

                sender:
                    "alerts@axis.bank.in",

                subject:
                    "INR 350 debited",

                body:
                    "Amount Debited: INR 350",

                receivedAt:
                    new Date(
                        "2026-08-30T17:21:42+05:30",
                    ),
            });

        expect(result).toEqual({
            status: "duplicate",
            transactionId: "existing-transaction",
        });

        expect(
            mocks.transactionCreate,
        ).not.toHaveBeenCalled();
    });

    /* ---------------------------------------------------------------------- */
    /*                          Provider handling                              */
    /* ---------------------------------------------------------------------- */

    it("returns unsupported for an unknown bank provider", async () => {
        mocks.detectBankProvider
            .mockReturnValue(
                BankProvider.UNKNOWN,
            );

        const result =
            await ingestGmailEmail({
                userId: "user-1",

                gmailMessageId:
                    "unsupported-bank",

                sender:
                    "unknown@example.com",

                subject:
                    "Transaction alert",

                body:
                    "Some transaction",

                receivedAt:
                    new Date(),
            });

        expect(result.status)
            .toBe("unsupported");

        expect(
            mocks.parseEmail,
        ).not.toHaveBeenCalled();

        expect(
            mocks.transaction,
        ).not.toHaveBeenCalled();
    });

    it("returns not-a-transaction when the parser returns null", async () => {
        mocks.detectBankProvider
            .mockReturnValue(
                BankProvider.AXIS,
            );

        mocks.parseEmail
            .mockReturnValue(null);

        const result =
            await ingestGmailEmail({
                userId: "user-1",

                gmailMessageId:
                    "not-a-transaction",

                sender:
                    "alerts@axis.bank.in",

                subject:
                    "Your monthly statement",

                body:
                    "Your statement is ready",

                receivedAt:
                    new Date(),
            });

        expect(result.status)
            .toBe(
                "not-a-transaction",
            );

        expect(
            mocks.transaction,
        ).not.toHaveBeenCalled();

        expect(
            mocks.transactionCreate,
        ).not.toHaveBeenCalled();
    });

    /* ---------------------------------------------------------------------- */
    /*                              Date tests                                 */
    /* ---------------------------------------------------------------------- */

    it("parses Axis credit card date correctly", () => {
        const result =
            parseAxisEmail(
                "INR 350.00 spent on credit card no. XX1256",

                `
                    30-08-2026

                    Dear Nishant Sharma,

                    Here's the summary of your Axis Bank Credit Card Transaction:

                    Transaction Amount:
                    INR 350.00

                    Merchant Name:
                    MADHU WINES

                    Axis Bank Credit Card No.
                    XX1256

                    Date & Time:
                    30-08-2026, 17:21:42 IST
                `,
            );

        expect(
            result?.transactionDate,
        ).toEqual(
            new Date(
                "2026-08-30T17:21:42+05:30",
            ),
        );
    });

    it("creates IST date correctly", () => {
        expect(
            createISTDate(
                2026,
                7,
                30,
                17,
                21,
                42,
            ).toISOString(),
        ).toBe(
            "2026-08-30T11:51:42.000Z",
        );
    });
});