import {describe, expect, it} from "vitest";

import {normalizeMerchantName} from "./merchant.normalizer";

describe("normalizeMerchantName", () => {
    it("returns an empty string for undefined", () => {
        expect(normalizeMerchantName(undefined)).toBe("");
    });

    it("returns an empty string for null", () => {
        expect(normalizeMerchantName(null)).toBe("");
    });

    it("returns an empty string for an empty value", () => {
        expect(normalizeMerchantName("")).toBe("");
    });

    it("trims whitespace", () => {
        expect(
            normalizeMerchantName("   Swiggy   "),
        ).toBe("swiggy");
    });

    it("normalizes to lowercase", () => {
        expect(
            normalizeMerchantName("SWIGGY"),
        ).toBe("swiggy");
    });

    it("removes payment gateway prefixes", () => {
        expect(
            normalizeMerchantName("RAZORPAY Swiggy"),
        ).toBe("swiggy");
    });

    it("removes transaction prefixes", () => {
        expect(
            normalizeMerchantName("UPI Swiggy"),
        ).toBe("swiggy");
    });

    it("removes multiple chained prefixes", () => {
        expect(
            normalizeMerchantName(
                "UPI RAZORPAY PAYTM Swiggy",
            ),
        ).toBe("swiggy");
    });

    it("removes prefixes separated by punctuation", () => {
        expect(
            normalizeMerchantName(
                "UPI:RAZORPAY/Swiggy",
            ),
        ).toBe("swiggy");
    });

    it("removes UPI handles", () => {
        expect(
            normalizeMerchantName(
                "Swiggy@oksbi",
            ),
        ).toBe("swiggy");
    });

    it("removes URLs", () => {
        expect(
            normalizeMerchantName(
                "Swiggy https://swiggy.com",
            ),
        ).toBe("swiggy");
    });

    it("removes email addresses", () => {
        expect(
            normalizeMerchantName(
                "support@swiggy.com Swiggy",
            ),
        ).toBe("swiggy");
    });

    it("removes punctuation", () => {
        expect(
            normalizeMerchantName(
                "Swiggy!!!",
            ),
        ).toBe("swiggy");
    });

    it("collapses multiple spaces", () => {
        expect(
            normalizeMerchantName(
                "Local      Grocery",
            ),
        ).toBe("local grocery");
    });

    it("collapses duplicate names", () => {
        expect(
            normalizeMerchantName(
                "food food delivery delivery",
            ),
        ).toBe("food delivery");
    });

    it("removes stop words", () => {
        expect(
            normalizeMerchantName(
                "Swiggy Technologies Private Limited",
            ),
        ).toBe("swiggy");
    });

    it("returns the alias for amazon", () => {
        expect(
            normalizeMerchantName("Amazon India"),
        ).toBe("amazon");
    });

    it("maps amzn to amazon", () => {
        expect(
            normalizeMerchantName("AMZN"),
        ).toBe("amazon");
    });

    it("maps known aliases", () => {
        expect(
            normalizeMerchantName("Netflix Pvt Ltd"),
        ).toBe("netflix");
    });

    it("deduplicates repeated words", () => {
        expect(
            normalizeMerchantName(
                "food food delivery delivery",
            ),
        ).toBe("food delivery");
    });

    it("returns remaining words when no alias exists", () => {
        expect(
            normalizeMerchantName(
                "Local Grocery Store",
            ),
        ).toBe("local grocery store");
    });

    it("returns an empty string when only stop words remain", () => {
        expect(
            normalizeMerchantName(
                "Private Limited Company India",
            ),
        ).toBe("");
    });

    it("handles mixed punctuation and prefixes", () => {
        expect(
            normalizeMerchantName(
                "UPI-RAZORPAY:Swiggy Pvt. Ltd.",
            ),
        ).toBe("swiggy");
    });

    it("strips debit card prefix", () => {
        expect(
            normalizeMerchantName(
                "Debit Card Amazon",
            ),
        ).toBe("amazon");
    });

    it("strips credit card prefix", () => {
        expect(
            normalizeMerchantName(
                "Credit Card Netflix",
            ),
        ).toBe("netflix");
    });

    it("strips POS prefix", () => {
        expect(
            normalizeMerchantName(
                "POS Zomato",
            ),
        ).toBe("zomato");
    });

    it("strips NEFT prefix", () => {
        expect(
            normalizeMerchantName(
                "NEFT Google",
            ),
        ).toBe("google");
    });

    it("strips IMPS prefix", () => {
        expect(
            normalizeMerchantName(
                "IMPS Apple",
            ),
        ).toBe("apple");
    });

    it("returns empty when normalization removes everything", () => {
        expect(
            normalizeMerchantName("@oksbi"),
        ).toBe("");
    });
});