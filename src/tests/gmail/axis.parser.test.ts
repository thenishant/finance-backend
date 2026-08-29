import {
    FinancialAccountType,
    TransactionType,
} from "@prisma/client";
import {describe, expect, it} from "vitest";

import {parseAxisEmail} from "../../modules/email/gmail/parsers/axis/axis.parser";


describe("Axis email parser", () => {
    describe("standard bank account debit", () => {
        it("parses a UPI debit transaction", () => {
            const result = parseAxisEmail(
                "INR 160.00 was debited from your A/c no. XX0999.",
                `
                    AXIS BANK

                    28-08-2026

                    Dear Customer,

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

                    Regards,
                    Axis Bank Ltd.
                `,
            );

            expect(result).not.toBeNull();

            expect(result).toMatchObject({
                amount: 160,
                type: TransactionType.EXPENSE,
                merchant: "SHAKILA THAPA",
                resolveMerchant: true,
                accountLast4: "0999",
                accountType: FinancialAccountType.BANK_ACCOUNT,
            });

            expect(result?.transactionDate).toBeInstanceOf(Date);
        });
    });


    describe("standard bank account credit", () => {
        it("parses an ACH credit transaction", () => {
            const result = parseAxisEmail(
                "Credit transaction alert for Axis Bank A/c",
                `
                    Credit transaction alert for Axis Bank A/c

                    27-08-2026

                    Dear Customer,

                    Thank you for banking with us.

                    We wish to inform you that your A/c no. XX0999
                    has been credited with INR 110.00
                    on 27-08-2026 at 08:29:30 IST
                    by ACH-CR-BIKAJI FOODS INT LT.

                    To check your available balance,
                    please click here.

                    For details, please contact your Burgundy RM.

                    Regards,
                    Axis Bank Ltd.
                `,
            );

            expect(result).not.toBeNull();

            expect(result).toMatchObject({
                amount: 110,
                type: TransactionType.INCOME,
                merchant: "ACH-CR-BIKAJI FOODS INT LT",
                resolveMerchant: true,
                accountLast4: "0999",
                accountType: FinancialAccountType.BANK_ACCOUNT,
            });

            expect(result?.transactionDate).toBeInstanceOf(Date);
        });
    });


    describe("credit card", () => {
        it("parses an Axis credit card transaction", () => {
            const result = parseAxisEmail(
                "INR 12 spent on credit card no. XX1256",
                `
                    AXIS BANK

                    28-08-2026

                    Dear Customer,

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

                    Regards,
                    Axis Bank Ltd.
                `,
            );

            expect(result).not.toBeNull();

            expect(result).toMatchObject({
                amount: 12,
                type: TransactionType.EXPENSE,
                merchant: "ASSPL",
                resolveMerchant: true,
                accountLast4: "1256",
                accountType: FinancialAccountType.CREDIT_CARD,
            });

            expect(result?.transactionDate).toBeInstanceOf(Date);
        });
    });


    describe("Burgundy debit", () => {
        it("parses a Burgundy debit transaction", () => {
            const result = parseAxisEmail(
                "Debit transaction alert for Axis Bank A/c",
                `
                    logo

                    27-08-2026

                    Dear Customer,

                    Thank you for banking with us.

                    We wish to inform you that your A/c no. XX0999
                    has been debited with INR 14500.00
                    on 27-08-2026 08:30:06 IST
                    by ACH-DR-Indian Clearing Cor.

                    To check your available balance,
                    please click here.

                    For details, please contact your Burgundy RM.

                    Regards,
                    Axis Bank Ltd.
                `,
            );

            expect(result).not.toBeNull();

            expect(result).toMatchObject({
                amount: 14500,
                type: TransactionType.EXPENSE,
                merchant: "ACH-DR-Indian Clearing Cor",
                resolveMerchant: true,
                accountLast4: "0999",
                accountType: FinancialAccountType.BANK_ACCOUNT,
            });

            expect(result?.transactionDate).toBeInstanceOf(Date);
        });
    });


    describe("Burgundy credit", () => {
        it("parses a Burgundy credit transaction", () => {
            const result = parseAxisEmail(
                "Credit transaction alert for Axis Bank A/c",
                `
                    27-08-2026

                    Dear Customer,

                    Thank you for banking with us.

                    We wish to inform you that your A/c no. XX0999
                    has been credited with INR 110.00
                    on 27-08-2026 at 08:29:30 IST
                    by ACH-CR-BIKAJI FOODS INT LT.

                    To check your available balance,
                    please click here.

                    For details, please contact your Burgundy RM.

                    Regards,
                    Axis Bank Ltd.
                `,
            );

            expect(result).not.toBeNull();

            expect(result).toMatchObject({
                amount: 110,
                type: TransactionType.INCOME,
                merchant: "ACH-CR-BIKAJI FOODS INT LT",
                resolveMerchant: true,
                accountLast4: "0999",
                accountType: FinancialAccountType.BANK_ACCOUNT,
            });

            expect(result?.transactionDate).toBeInstanceOf(Date);
        });
    });


    describe("unsupported emails", () => {
        it("returns null for an unrelated email", () => {
            const result = parseAxisEmail(
                "Welcome to Axis Bank",
                `
                    Welcome to Axis Bank.

                    Thank you for choosing us.
                `,
            );

            expect(result).toBeNull();
        });

        it("returns null for an autopay reminder", () => {
            const result = parseAxisEmail(
                "Axis Bank credit card autopay reminder",
                `
                    Your credit card autopay is due soon.
                `,
            );

            expect(result).toBeNull();
        });
    });
});