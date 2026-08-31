import {describe, expect, it} from "vitest";

import {
    extractAxisAccountLast4,
    extractAxisAmount,
    extractAxisBurgundyCounterparty,
    extractAxisCreditCardMerchant,
    extractAxisDate,
    extractAxisTransactionInfo,
    parseAxisDate,
} from "../../modules/email/gmail/parsers/axis/axis.extractors";


describe("Axis extractors", () => {
    describe("extractAxisAmount", () => {
        it("extracts an amount", () => {
            expect(
                extractAxisAmount(
                    "Amount Debited: INR 1,250.00",
                    [
                        /Amount Debited:\s*INR\s*([\d,.]+)/i,
                    ],
                ),
            ).toBe(1250);
        });

        it("handles amounts without commas", () => {
            expect(
                extractAxisAmount(
                    "Amount Credited: INR 110.00",
                    [
                        /Amount Credited:\s*INR\s*([\d,.]+)/i,
                    ],
                ),
            ).toBe(110);
        });

        it("returns null when no amount matches", () => {
            expect(
                extractAxisAmount(
                    "No transaction amount",
                    [
                        /Amount Debited:\s*INR\s*([\d,.]+)/i,
                    ],
                ),
            ).toBeNull();
        });
    });


    describe("extractAxisAccountLast4", () => {
        it("extracts account last 4 digits", () => {
            expect(
                extractAxisAccountLast4(
                    "Account Number: XX0999",
                ),
            ).toBe("0999");
        });

        it("extracts account last 4 digits from A/c no.", () => {
            expect(
                extractAxisAccountLast4(
                    "A/c no. XX1234",
                ),
            ).toBe("1234");
        });

        it("supports longer masking", () => {
            expect(
                extractAxisAccountLast4(
                    "A/c no. XXXX1234",
                ),
            ).toBe("1234");
        });

        it("extracts credit card last 4 digits", () => {
            expect(
                extractAxisAccountLast4(
                    "Credit Card No. XX1256",
                ),
            ).toBe("1256");
        });

        it("returns null when account/card is absent", () => {
            expect(
                extractAxisAccountLast4(
                    "No account information",
                ),
            ).toBeNull();
        });
    });


    describe("extractAxisTransactionInfo", () => {
        it("extracts a normal merchant", () => {
            expect(
                extractAxisTransactionInfo(
                    `
                    Transaction Info:
                    SWIGGY

                    If this transaction was not initiated by you:
                    `,
                ),
            ).toBe("SWIGGY");
        });

        it("extracts merchant from inline Transaction Info", () => {
            expect(
                extractAxisTransactionInfo(
                    "Transaction Info: SWIGGY",
                ),
            ).toBe("SWIGGY");
        });

        it("extracts merchant from UPI transaction info", () => {
            expect(
                extractAxisTransactionInfo(
                    `
                    Transaction Info:
                    UPI/P2M/660615862577/SHAKILA THAPA

                    If this transaction was not initiated by you:
                    `,
                ),
            ).toBe("SHAKILA THAPA");
        });

        it("removes trailing punctuation", () => {
            expect(
                extractAxisTransactionInfo(
                    "Transaction Info: SWIGGY.",
                ),
            ).toBe("SWIGGY");
        });

        it("does not include flattened footer content", () => {
            expect(
                extractAxisTransactionInfo(
                    "Transaction Info: SWIGGY Feel free to contact us.",
                ),
            ).toBe("SWIGGY");
        });

        it("returns null when Transaction Info is absent", () => {
            expect(
                extractAxisTransactionInfo(
                    "Amount Debited: INR 1250",
                ),
            ).toBeNull();
        });
    });


    describe("extractAxisCreditCardMerchant", () => {
        it("extracts credit card merchant", () => {
            expect(
                extractAxisCreditCardMerchant(
                    `
                    Merchant Name:
                    ASSPL

                    Axis Bank Credit Card No.
                    XX1256
                    `,
                ),
            ).toBe("ASSPL");
        });

        it("extracts inline credit card merchant", () => {
            expect(
                extractAxisCreditCardMerchant(
                    "Merchant Name: ASSPL",
                ),
            ).toBe("ASSPL");
        });

        it("removes trailing punctuation", () => {
            expect(
                extractAxisCreditCardMerchant(
                    "Merchant Name: ASSPL.",
                ),
            ).toBe("ASSPL");
        });
    });


    describe("extractAxisBurgundyCounterparty", () => {
        it("extracts Burgundy debit counterparty", () => {
            expect(
                extractAxisBurgundyCounterparty(
                    `
                    has been debited with INR 14500.00
                    on 27-08-2026 08:30:06 IST
                    by ACH-DR-Indian Clearing Cor.
                    `,
                ),
            ).toBe("ACH-DR-Indian Clearing Cor");
        });

        it("extracts Burgundy credit counterparty", () => {
            expect(
                extractAxisBurgundyCounterparty(
                    `
                    has been credited with INR 110.00
                    on 27-08-2026 at 08:29:30 IST
                    by ACH-CR-BIKAJI FOODS INT LT.
                    `,
                ),
            ).toBe("ACH-CR-BIKAJI FOODS INT LT");
        });

        it("removes trailing punctuation", () => {
            expect(
                extractAxisBurgundyCounterparty(
                    "by ACH-DR-Indian Clearing Cor.",
                ),
            ).toBe("ACH-DR-Indian Clearing Cor");
        });

        it("does not include flattened footer content", () => {
            expect(
                extractAxisBurgundyCounterparty(
                    "by ACH-CR-BIKAJI FOODS INT LT. Feel free to contact us.",
                ),
            ).toBe("ACH-CR-BIKAJI FOODS INT LT");
        });

        it("returns null when counterparty is absent", () => {
            expect(
                extractAxisBurgundyCounterparty(
                    "has been debited with INR 14500.00",
                ),
            ).toBeNull();
        });
    });


    describe("parseAxisDate", () => {
        it("parses a four digit year", () => {
            const result = parseAxisDate(
                "28-08-2026",
                "20:40:27",
            );

            expect(result).toEqual(
                new Date("2026-08-28T20:40:27+05:30"),
            );
        });

        it("parses a two digit year", () => {
            const result = parseAxisDate(
                "28-08-26",
                "20:40:27",
            );

            expect(result).toEqual(
                new Date("2026-08-28T20:40:27+05:30"),
            );
        });

        it("returns undefined for invalid date", () => {
            expect(
                parseAxisDate(
                    "invalid",
                    "20:40:27",
                ),
            ).toBeUndefined();
        });

        it("returns undefined for invalid time", () => {
            expect(
                parseAxisDate(
                    "28-08-2026",
                    "invalid",
                ),
            ).toBeUndefined();
        });
    });


    describe("extractAxisDate", () => {
        it("extracts standard date and time", () => {
            const result = extractAxisDate(
                "Date & Time: 28-08-2026, 07:59:41 IST",
            );

            expect(result).toEqual(
                new Date("2026-08-28T07:59:41+05:30"),
            );
        });

        it("supports two digit year", () => {
            const result = extractAxisDate(
                "Date & Time: 28-08-26, 20:40:27 IST",
            );

            expect(result).toEqual(
                new Date("2026-08-28T20:40:27+05:30"),
            );
        });

        it("supports 'at' before time", () => {
            const result = extractAxisDate(
                "27-08-2026 at 08:29:30 IST",
            );

            expect(result).toEqual(
                new Date("2026-08-27T08:29:30+05:30"),
            );
        });

        it("returns undefined when date is absent", () => {
            expect(
                extractAxisDate(
                    "No date information",
                ),
            ).toBeUndefined();
        });
    });
    describe("extractAxisTransactionInfo", () => {
        it("extracts the counterparty from UPI P2M transactions", () => {
            const body = `
            Transaction Info: UPI/P2M/660615862577/SHAKILA THAPA
            If this transaction was not initiated by you
        `;

            expect(
                extractAxisTransactionInfo(body),
            ).toBe("SHAKILA THAPA");
        });

        it("extracts the counterparty from UPI P2A transactions", () => {
            const body = `
            Transaction Info: UPI/P2A/624207512807/DEEPANSHU/SBIN/Birt
            If this transaction was not initiated by you
        `;

            expect(
                extractAxisTransactionInfo(body),
            ).toBe("DEEPANSHU");
        });

        it("extracts a multi-word UPI counterparty", () => {
            const body = `
            Transaction Info: UPI/P2A/623545792613/BAJARANGI KUMAR
            If this transaction was not initiated by you
        `;

            expect(
                extractAxisTransactionInfo(body),
            ).toBe("BAJARANGI KUMAR");
        });

        it("returns null for an uninformative POS identifier", () => {
            const body = `
            Transaction Info: pos.11329019@indus
            If this transaction was not initiated by you
        `;

            expect(
                extractAxisTransactionInfo(body),
            ).toBeNull();
        });
    });
});