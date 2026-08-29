import {describe, expect, it, vi,} from "vitest";

import {FinancialAccountType, TransactionType,} from "@prisma/client";
import {parseAxisEmail} from "../../modules/email/gmail/parsers/axis/axis.parser";

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
});