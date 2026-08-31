import {beforeEach, describe, expect, it, vi,} from "vitest";

import {CategoryAssignmentSource, FinancialAccountType, TransactionSource, TransactionType,} from "@prisma/client";
import {parseAxisEmail} from "../../modules/email/gmail/parsers/axis/axis.parser";
import {ingestGmailEmail} from "../../modules/email/gmail/ingestion/transaction.ingestion";
import {BankProvider} from "../../modules/email/gmail/detector/bank.detector";
import {createISTDate} from "../../date";

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

describe("Axis email parser", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("assigns categoryId to Gmail imported non-transfer transactions", async () => {
        const userId = "test-user-id";
        const categoryId = "test-category-id";
        const merchantId = "test-merchant-id";

        mocks.detectBankProvider.mockReturnValue(
            "AXIS",
        );

        mocks.parseEmail.mockReturnValue({
            amount: 350,
            type: TransactionType.EXPENSE,
            merchant: "MADHU WINES",
            accountLast4: "1256",
            accountType:
            FinancialAccountType.CREDIT_CARD,
            transactionDate: new Date(
                "2026-08-30T17:21:42+05:30",
            ),
            resolveMerchant: true,
        });

        mocks.resolveTransactionMerchant.mockResolvedValue({
            merchant: {
                id: merchantId,
                name: "Madhu Wines",
            },
            merchantId,
            merchantRaw: "MADHU WINES",
            merchantNormalized: "Madhu Wines",
            category: {
                id: categoryId,
                name: "Food & Dining",
                type: TransactionType.EXPENSE,
            },
            categoryId,
            categoryAssignmentSource:
            CategoryAssignmentSource.AI,
            confidence: 0.95,
        });

        mocks.transactionFindUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);

        mocks.financialAccountFindFirst.mockResolvedValue({
            id: "account-id",
        });

        mocks.transaction.mockImplementation(
            async callback =>
                callback({
                    transaction: {
                        findUnique:
                        mocks.transactionFindUnique,
                        create: mocks.transactionCreate,
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
            type: TransactionType.EXPENSE,
            amount: 350,
            date: new Date(
                "2026-08-30T17:21:42+05:30",
            ),
            year: 2026,
            month: 8,
            merchantId,
            merchantRaw: "MADHU WINES",
            merchantNormalized: "Madhu Wines",
            categoryId,
            categoryAssignmentSource:
            CategoryAssignmentSource.AI,
            aiCategoryConfidence: 0.95,
            source: TransactionSource.GMAIL,
            sourceAccountId: "account-id",
        });

        const result = await ingestGmailEmail({
            userId,
            gmailMessageId: "gmail-category-test-1",
            sender: "alerts@axis.bank.in",
            subject:
                "INR 350.00 was debited from your A/c.",
            body: `
            Amount Debited: INR 350.00
            Account Number: XX1256
            Transaction Info: MADHU WINES
        `,
            receivedAt: new Date(
                "2026-08-30T17:21:42+05:30",
            ),
        });

        expect(result.status).toBe("created");

        expect(mocks.transactionCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    categoryId,
                    categoryAssignmentSource:
                    CategoryAssignmentSource.AI,
                    aiCategoryConfidence: 0.95,
                }),
            }),
        );
    });

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

        expect(result?.amount).toBe(160);

        expect(result?.type).toBe(
            TransactionType.EXPENSE,
        );

        /*
         * The parser must extract the merchant,
         * not return the entire UPI transaction string.
         */
        expect(result?.merchant).toBe(
            "SHAKILA THAPA",
        );

        expect(result?.resolveMerchant).toBe(
            true,
        );

        expect(result?.accountLast4).toBe(
            "0999",
        );

        expect(result?.accountType).toBe(
            FinancialAccountType.BANK_ACCOUNT,
        );

        expect(result?.transactionDate).toBeDefined();
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

        expect(result?.amount).toBe(110);

        expect(result?.type).toBe(
            TransactionType.INCOME,
        );

        expect(result?.merchant).toBe(
            "ACH-CR-BIKAJI FOODS INT LT",
        );

        expect(result?.resolveMerchant).toBe(
            true,
        );

        expect(result?.accountLast4).toBe(
            "0999",
        );

        expect(result?.accountType).toBe(
            FinancialAccountType.BANK_ACCOUNT,
        );

        expect(result?.transactionDate).toBeDefined();
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

        expect(result?.amount).toBe(
            14500,
        );

        expect(result?.type).toBe(
            TransactionType.EXPENSE,
        );

        expect(result?.merchant).toBe(
            "ACH-DR-Indian Clearing Cor",
        );

        expect(result?.resolveMerchant).toBe(
            true,
        );

        expect(result?.accountLast4).toBe(
            "0999",
        );

        expect(result?.accountType).toBe(
            FinancialAccountType.BANK_ACCOUNT,
        );

        expect(result?.transactionDate).toBeDefined();
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

        expect(result?.amount).toBe(110);

        expect(result?.type).toBe(
            TransactionType.INCOME,
        );

        expect(result?.merchant).toBe(
            "ACH-CR-BIKAJI FOODS INT LT",
        );

        expect(result?.resolveMerchant).toBe(
            true,
        );

        expect(result?.accountLast4).toBe(
            "0999",
        );

        expect(result?.accountType).toBe(
            FinancialAccountType.BANK_ACCOUNT,
        );

        expect(result?.transactionDate).toBeDefined();
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

        expect(result?.amount).toBe(12);

        expect(result?.type).toBe(
            TransactionType.EXPENSE,
        );

        expect(result?.merchant).toBe(
            "ASSPL",
        );

        expect(result?.resolveMerchant).toBe(
            true,
        );

        expect(result?.accountLast4).toBe(
            "1256",
        );

        expect(result?.accountType).toBe(
            FinancialAccountType.CREDIT_CARD,
        );

        expect(result?.transactionDate).toBeDefined();
    });


    it("ignores Axis autopay emails", () => {

        const result =
            parseAxisEmail(
                "INR 2,000 autopay reminder",
                "Amount Debited: INR 2,000",
            );

        expect(result).toBeNull();
    });


    it("ignores Axis reminder emails", () => {

        const result =
            parseAxisEmail(
                "INR 2,000 payment reminder",
                "Amount Debited: INR 2,000",
            );

        expect(result).toBeNull();
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

        expect(result).toBeNull();
    });

    it("allows Gmail transfers without a category", async () => {
        mocks.detectBankProvider.mockReturnValue(
            BankProvider.AXIS,
        );

        mocks.parseEmail.mockReturnValue({
            amount: 3000,
            type: TransactionType.TRANSFER,
            merchant: "Credit Card Transfer",
            resolveMerchant: true,
            accountLast4: "0999",
            accountType:
            FinancialAccountType.BANK_ACCOUNT,
            transactionDate: new Date(
                "2026-08-30T21:54:13+05:30",
            ),
        });

        mocks.resolveTransactionMerchant.mockResolvedValue({
            merchant: {
                id: "merchant-transfer",
                name: "Credit Card Transfer",
            },
            merchantId: "merchant-transfer",
            merchantRaw: "Credit Card Transfer",
            merchantNormalized: "Credit Card Transfer",

            category: null,
            categoryId: null,

            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,

            confidence: 1,
        });

        mocks.transaction.mockImplementation(
            async (callback: any) => {
                return callback({
                    transaction: {
                        findUnique: mocks.transactionFindUnique,
                        create: mocks.transactionCreate,
                        update: vi.fn(),
                    },
                    financialAccount: {
                        findFirst:
                        mocks.financialAccountFindFirst,
                    },
                });
            },
        );

        mocks.transactionFindUnique.mockResolvedValue(
            null,
        );

        mocks.financialAccountFindFirst.mockResolvedValue({
            id: "account-1",
        });

        mocks.transactionCreate.mockResolvedValue({
            id: "transaction-1",
            userId: "user-1",
            type: TransactionType.TRANSFER,
            amount: 3000,
            year: 2026,
            month: 8,
            categoryId: null,
        });

        const result = await ingestGmailEmail({
            userId: "user-1",
            gmailMessageId: "gmail-transfer-test",
            sender: "alerts@axis.bank.in",
            subject: "Credit Card Transfer",
            body: "Transfer",
            receivedAt: new Date(
                "2026-08-30T21:54:13+05:30",
            ),
        });

        expect(result.status).toBe("created");

        expect(
            mocks.transactionCreate,
        ).toHaveBeenCalled();
    });

    it("rejects Gmail non-transfer transactions when categorization fails", async () => {
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

        mocks.resolveTransactionMerchant.mockResolvedValue({
            merchant: {
                id: "merchant-1",
                name: "Madhu Wines",
            },
            merchantId: "merchant-1",
            merchantRaw: "MADHU WINES",
            merchantNormalized: "Madhu Wines",

            category: null,
            categoryId: null,

            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,

            confidence: 0,
        });

        await expect(
            ingestGmailEmail({
                userId: "user-1",
                gmailMessageId: "gmail-no-category",
                sender: "alerts@axis.bank.in",
                subject:
                    "INR 350.00 was debited from your A/c.",
                body: "Amount Debited: INR 350.00",
                receivedAt: new Date(
                    "2026-08-30T17:21:42+05:30",
                ),
            }),
        ).rejects.toThrow(
            "Gmail transaction could not be categorized",
        );

        expect(
            mocks.transactionCreate,
        ).not.toHaveBeenCalled();
    });

    it("parses Axis credit card date correctly", () => {
        const result = parseAxisEmail(
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

        expect(result?.transactionDate).toEqual(
            new Date("2026-08-30T17:21:42+05:30"),
        );
    });
    it("creates IST date correctly", () => {
        console.log(
            createISTDate(2026, 7, 30, 17, 21, 42).toISOString(),
        );
    });
});