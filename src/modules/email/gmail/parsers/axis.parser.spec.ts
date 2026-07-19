import {describe, expect, it} from "vitest";
import {FinancialAccountType, TransactionType} from "@prisma/client";
import {parseAxisEmail} from "./axis.parser";

describe("parseAxisEmail", () => {
    it("parses an Axis credit-card spend email", () => {
        const parsed = parseAxisEmail(
            "INR 1,234.50 spent on your Axis Bank Credit Card",
            "Transaction Amount: INR 1,234.50 Merchant Name: The Coffee Shop Axis Bank Credit Card No. XX1234 Date & Time: 15-07-2026, 13:45:00"
        );

        expect(parsed).toEqual({
            amount: 1234.5,
            merchant: "The Coffee Shop",
            accountLast4: "1234",
            accountType: FinancialAccountType.CREDIT_CARD,
            transactionDate: new Date(2026, 6, 15, 13, 45, 0),
            type: TransactionType.EXPENSE
        });
    });

    it("ignores Axis autopay and reminder emails", () => {
        expect(parseAxisEmail(
            "INR 500.00 AutoPay reminder",
            "Transaction Amount: INR 500.00"
        )).toBeNull();
    });

    it("parses an Axis bank-account debit email", () => {
        const parsed = parseAxisEmail(
            "INR 500.00 was debited from your A/c no. XX0999.",
            "Amount Debited: INR 500.00 Account Number: XX0999 Date & Time: 17-07-26, 00:09:14 IST Transaction Info: UPI/P2M/619885332714/SSP RESIDENCY BOARD If this transaction was not initiated by you:"
        );

        expect(parsed).toEqual({
            amount: 500,
            merchant: "UPI/P2M/619885332714/SSP RESIDENCY BOARD",
            transactionDate: new Date(2026, 6, 17, 0, 9, 14),
            accountLast4: "0999",
            accountType: FinancialAccountType.BANK_ACCOUNT,
            type: TransactionType.EXPENSE
        });
    });
});
