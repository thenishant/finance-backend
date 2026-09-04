import {describe, expect, it} from "vitest";

import {BankProvider, detectBankProvider,} from "../../modules/email/gmail/detector/bank.detector";

describe("bank.detector", () => {
    describe("detectBankProvider", () => {
        it("detects Axis Bank", () => {
            expect(
                detectBankProvider("alerts@axis.bank.in"),
            ).toBe(BankProvider.AXIS);
        });

        it("detects Axis Bank from a Gmail-style sender", () => {
            expect(
                detectBankProvider(
                    "Axis Bank <alerts@axis.bank.in>",
                ),
            ).toBe(BankProvider.AXIS);
        });

        it("detects Axis Bank case-insensitively", () => {
            expect(
                detectBankProvider("ALERTS@AXIS.BANK.IN"),
            ).toBe(BankProvider.AXIS);
        });

        it("detects HDFC Bank", () => {
            expect(
                detectBankProvider(
                    "alerts@hdfcbank.bank.in",
                ),
            ).toBe(BankProvider.HDFC);
        });

        it("detects HDFC Bank from a Gmail-style sender", () => {
            expect(
                detectBankProvider(
                    "HDFC Bank <alerts@hdfcbank.bank.in>",
                ),
            ).toBe(BankProvider.HDFC);
        });

        it("detects HDFC Bank case-insensitively", () => {
            expect(
                detectBankProvider(
                    "ALERTS@HDFCBANK.BANK.IN",
                ),
            ).toBe(BankProvider.HDFC);
        });

        it("detects SBI", () => {
            expect(
                detectBankProvider(
                    "alerts.sbi.bank.in",
                ),
            ).toBe(BankProvider.SBI);
        });

        it("detects SBI from a Gmail-style sender", () => {
            expect(
                detectBankProvider(
                    "SBI <alerts.sbi.bank.in>",
                ),
            ).toBe(BankProvider.SBI);
        });

        it("returns UNKNOWN for an unsupported sender", () => {
            expect(
                detectBankProvider(
                    "notifications@example.com",
                ),
            ).toBe(BankProvider.UNKNOWN);
        });

        it("returns UNKNOWN for null", () => {
            expect(
                detectBankProvider(null),
            ).toBe(BankProvider.UNKNOWN);
        });

        it("returns UNKNOWN for undefined", () => {
            expect(
                detectBankProvider(undefined),
            ).toBe(BankProvider.UNKNOWN);
        });

        it("returns UNKNOWN for an empty sender", () => {
            expect(
                detectBankProvider(""),
            ).toBe(BankProvider.UNKNOWN);
        });
    });
});