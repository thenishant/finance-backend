import {describe, expect, it} from "vitest";

import {FinancialAccountType, TransactionType,} from "@prisma/client";
import {BankProvider, detectBankProvider} from "../../modules/email/gmail/detector/bank.detector";
import {parseAxisEmail, parseAxisSubject} from "../../modules/email/gmail/parsers/axis.parser";
import {parseHdfcEmail, parseHdfcSubject} from "../../modules/email/gmail/parsers/hdfc.parser";
import {parseEmail} from "../../modules/email/gmail/parsers/parser.factory";
import {cleanEmailBody} from "../../modules/email/gmail/utils/body-cleaner";

describe("Gmail parsers", () => {

    describe("bank detector", () => {

        it("detects Axis emails", () => {
            expect(
                detectBankProvider(
                    "alerts@axis.bank.in",
                ),
            ).toBe(BankProvider.AXIS);
        });

        it("detects HDFC emails", () => {
            expect(
                detectBankProvider(
                    "alerts@hdfcbank.bank.in",
                ),
            ).toBe(BankProvider.HDFC);
        });

        it("detects SBI emails", () => {
            expect(
                detectBankProvider(
                    "alerts.sbi.bank.in",
                ),
            ).toBe(BankProvider.SBI);
        });

        it("returns UNKNOWN for an unrelated sender", () => {
            expect(
                detectBankProvider(
                    "amazon@example.com",
                ),
            ).toBe(BankProvider.UNKNOWN);
        });

        it("handles a missing sender", () => {
            expect(
                detectBankProvider(),
            ).toBe(BankProvider.UNKNOWN);
        });
    });

    describe("Axis subject parser", () => {

        it("parses an expense", () => {
            const result =
                parseAxisSubject(
                    "INR 1,250.00 spent on your Axis card",
                );

            expect(result).toEqual({
                amount: 1250,
                type: TransactionType.EXPENSE,
            });
        });

        it("parses an income", () => {
            const result =
                parseAxisSubject(
                    "INR 10,000 was credited to your account",
                );

            expect(result).toEqual({
                amount: 10000,
                type: TransactionType.INCOME,
            });
        });

        it("returns null for an unrelated subject", () => {
            expect(
                parseAxisSubject(
                    "Welcome to Axis Bank",
                ),
            ).toBeNull();
        });

        it("handles a missing subject", () => {
            expect(
                parseAxisSubject(),
            ).toBeNull();
        });
    });

    describe("HDFC subject parser", () => {

        it("parses a debit", () => {
            expect(
                parseHdfcSubject(
                    "Rs. 2,500 debited from your account",
                ),
            ).toEqual({
                amount: 2500,
                type: TransactionType.EXPENSE,
            });
        });

        it("parses a credit", () => {
            expect(
                parseHdfcSubject(
                    "Rs. 15,000 credited to your account",
                ),
            ).toEqual({
                amount: 15000,
                type: TransactionType.INCOME,
            });
        });

        it("returns null for unrelated subjects", () => {
            expect(
                parseHdfcSubject(
                    "Your HDFC statement is ready",
                ),
            ).toBeNull();
        });
    });

    describe("Axis email parser", () => {

        it("parses a bank account debit", () => {

            const subject =
                "INR 1,250 was debited from your A/c No. XXXXX1234";

            const body = `
                Amount Debited: INR 1,250
                Account Number: XXXXX1234
                Date & Time: 25-08-2026, 14:30:00
                Transaction Info: SWIGGY
            `;

            const result =
                parseAxisEmail(
                    subject,
                    body,
                );

            expect(result).not.toBeNull();

            expect(result?.amount).toBe(1250);
            expect(result?.merchant).toBe(
                "SWIGGY",
            );
            expect(result?.accountLast4).toBe(
                "1234",
            );
            expect(result?.accountType).toBe(
                FinancialAccountType.BANK_ACCOUNT,
            );
            expect(result?.type).toBe(
                TransactionType.EXPENSE,
            );
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
    });

    describe("HDFC email parser", () => {

        it("parses a bank account debit", () => {

            const body = `
                Account Number XXXXXX1234
                Rs. 1,500 has been debited
                towards SWIGGY with UMRN
                on 25-Aug-2026
            `;

            const result =
                parseHdfcEmail(
                    "Transaction alert",
                    body,
                );

            expect(result).not.toBeNull();

            expect(result?.amount).toBe(1500);
            expect(result?.merchant).toBe(
                "SWIGGY",
            );
            expect(result?.accountLast4).toBe(
                "1234",
            );
            expect(result?.accountType).toBe(
                FinancialAccountType.BANK_ACCOUNT,
            );
            expect(result?.type).toBe(
                TransactionType.EXPENSE,
            );
        });

        it("parses a credit card debit", () => {

            const body = `
                Credit Card ending 5678
                Rs. 999 has been debited
                towards AMAZON on 25 Aug,
                2026
            `;

            const result =
                parseHdfcEmail(
                    "Credit card transaction",
                    body,
                );

            expect(result).not.toBeNull();

            expect(result?.amount).toBe(999);
            expect(result?.accountLast4).toBe(
                "5678",
            );
            expect(result?.accountType).toBe(
                FinancialAccountType.CREDIT_CARD,
            );
            expect(result?.type).toBe(
                TransactionType.EXPENSE,
            );
        });

        it("returns null for an unsupported email", () => {

            expect(
                parseHdfcEmail(
                    "Hello",
                    "This is not a transaction",
                ),
            ).toBeNull();
        });
    });

    describe("parser factory", () => {
        it("uses the Axis parser", () => {
            const result = parseEmail(
                BankProvider.AXIS,
                "INR 1,250 spent on your Axis Bank Credit Card",
                `
            Transaction Amount: INR 1,250
            Merchant Name: Amazon
            Axis Bank Credit Card No. XXXX 1234
            Date & Time: 26-08-2026, 14:30:00
        `,
            );

            expect(result).not.toBeNull();
            expect(result?.amount).toBe(1250);
            expect(result?.type).toBe(
                TransactionType.EXPENSE,
            );
            expect(result?.merchant).toBe("Amazon");
            expect(result?.accountLast4).toBe("1234");
            expect(result?.accountType).toBe(
                FinancialAccountType.CREDIT_CARD,
            );
        });

        it("uses the HDFC parser", () => {
            const result = parseEmail(
                BankProvider.HDFC,
                "Rs. 500 debited from your HDFC Bank account",
                `
            Account Number XXXX1234
            Rs. 500 has been debited towards Amazon with UMRN
            on 26-Aug-2026
        `,
            );

            expect(result).not.toBeNull();
            expect(result?.amount).toBe(500);
            expect(result?.type).toBe(TransactionType.EXPENSE);
            expect(result?.merchant).toBe("Amazon");
            expect(result?.accountLast4).toBe("1234");
            expect(result?.accountType).toBe(
                FinancialAccountType.BANK_ACCOUNT,
            );
        });

        it("returns null for an unsupported provider", () => {
            expect(
                parseEmail(
                    BankProvider.SBI,
                    "anything",
                    "anything",
                ),
            ).toBeNull();
        });
    });

    describe("body cleaner", () => {

        it("removes HTML and scripts", () => {

            const result =
                cleanEmailBody(`
                    <html>
                        <style>.foo { display:none }</style>
                        <script>alert("x")</script>
                        <body>
                            <p>Amount: Rs. 500</p>
                            <br>
                            <div>Merchant: Swiggy</div>
                        </body>
                    </html>
                `);

            expect(result).not.toContain(
                "<script",
            );

            expect(result).not.toContain(
                "<style",
            );

            expect(result).toContain(
                "Amount: Rs. 500",
            );

            expect(result).toContain(
                "Merchant: Swiggy",
            );
        });

        it("decodes common HTML entities", () => {

            expect(
                cleanEmailBody(
                    "A &amp; B&nbsp;&lt;test&gt;",
                ),
            ).toBe(
                "A & B <test>",
            );
        });

        it("collapses whitespace", () => {

            expect(
                cleanEmailBody(
                    "  hello   \n\n world  ",
                ),
            ).toBe(
                "hello world",
            );
        });
    });
});