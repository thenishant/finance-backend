import {beforeEach, describe, expect, it, vi} from "vitest";

import {BankProvider,} from "../../modules/email/gmail/detector/bank.detector";

import {parseEmail} from "../../modules/email/gmail/parsers/parser.factory";

import {parseAxisEmail} from "../../modules/email/gmail/parsers/axis/axis.parser";
import {parseHdfcEmail} from "../../modules/email/gmail/parsers/hdfc.parser";

vi.mock(
    "../../modules/email/gmail/parsers/axis/axis.parser",
    () => ({
        parseAxisEmail: vi.fn(),
    }),
);

vi.mock(
    "../../modules/email/gmail/parsers/hdfc.parser",
    () => ({
        parseHdfcEmail: vi.fn(),
    }),
);

const mockedParseAxisEmail = vi.mocked(parseAxisEmail);
const mockedParseHdfcEmail = vi.mocked(parseHdfcEmail);

describe("parser.factory", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("parseEmail", () => {
        it("routes Axis emails to the Axis parser", () => {
            const parsedTransaction = {
                type: "EXPENSE",
                amount: "350",
                merchant: "MADHU WINES",
            };

            mockedParseAxisEmail.mockReturnValue(
                parsedTransaction as any,
            );

            const result = parseEmail(
                BankProvider.AXIS,
                "Axis transaction",
                "transaction body",
            );

            expect(
                mockedParseAxisEmail,
            ).toHaveBeenCalledWith(
                "Axis transaction",
                "transaction body",
            );

            expect(
                mockedParseHdfcEmail,
            ).not.toHaveBeenCalled();

            expect(result).toEqual(
                parsedTransaction,
            );
        });

        it("routes HDFC emails to the HDFC parser", () => {
            const parsedTransaction = {
                type: "EXPENSE",
                amount: "500",
                merchant: "AMAZON",
            };

            mockedParseHdfcEmail.mockReturnValue(
                parsedTransaction as any,
            );

            const result = parseEmail(
                BankProvider.HDFC,
                "HDFC transaction",
                "transaction body",
            );

            expect(
                mockedParseHdfcEmail,
            ).toHaveBeenCalledWith(
                "HDFC transaction",
                "transaction body",
            );

            expect(
                mockedParseAxisEmail,
            ).not.toHaveBeenCalled();

            expect(result).toEqual(
                parsedTransaction,
            );
        });

        it("uses an empty subject when subject is null", () => {
            mockedParseAxisEmail.mockReturnValue(null);

            parseEmail(
                BankProvider.AXIS,
                null,
                "transaction body",
            );

            expect(
                mockedParseAxisEmail,
            ).toHaveBeenCalledWith(
                "",
                "transaction body",
            );
        });

        it("uses an empty subject when subject is undefined", () => {
            mockedParseAxisEmail.mockReturnValue(null);

            parseEmail(
                BankProvider.AXIS,
                undefined,
                "transaction body",
            );

            expect(
                mockedParseAxisEmail,
            ).toHaveBeenCalledWith(
                "",
                "transaction body",
            );
        });

        it("returns null for an unsupported provider", () => {
            const result = parseEmail(
                BankProvider.UNKNOWN,
                "subject",
                "body",
            );

            expect(result).toBeNull();

            expect(
                mockedParseAxisEmail,
            ).not.toHaveBeenCalled();

            expect(
                mockedParseHdfcEmail,
            ).not.toHaveBeenCalled();
        });

        it("returns null for SBI until an SBI parser is supported", () => {
            const result = parseEmail(
                BankProvider.SBI,
                "subject",
                "body",
            );

            expect(result).toBeNull();

            expect(
                mockedParseAxisEmail,
            ).not.toHaveBeenCalled();

            expect(
                mockedParseHdfcEmail,
            ).not.toHaveBeenCalled();
        });

        it("passes the email body unchanged to the parser", () => {
            mockedParseAxisEmail.mockReturnValue(null);

            const body =
                "  Transaction alert\nAmount: ₹350\n  ";

            parseEmail(
                BankProvider.AXIS,
                "subject",
                body,
            );

            expect(
                mockedParseAxisEmail,
            ).toHaveBeenCalledWith(
                "subject",
                body,
            );
        });
    });
});