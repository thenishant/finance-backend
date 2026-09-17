import {describe, expect, it} from "vitest";

import {normalizeMerchantName} from "../../modules/merchant/merchant.normalizer";

describe("normalizeMerchantName", () => {
    describe("empty values", () => {
        it("returns an empty string for undefined", () => {
            expect(
                normalizeMerchantName(undefined),
            ).toBe("");
        });

        it("returns an empty string for null", () => {
            expect(
                normalizeMerchantName(null),
            ).toBe("");
        });

        it("returns an empty string for an empty string", () => {
            expect(
                normalizeMerchantName(""),
            ).toBe("");
        });

        it("returns an empty string for whitespace", () => {
            expect(
                normalizeMerchantName("   "),
            ).toBe("");
        });
    });

    describe("canonical merchant names", () => {
        it("returns Netflix with canonical casing", () => {
            expect(
                normalizeMerchantName("netflix"),
            ).toBe("Netflix");
        });

        it("normalizes NETFLIX.COM to Netflix", () => {
            expect(
                normalizeMerchantName("NETFLIX.COM"),
            ).toBe("Netflix");
        });

        it("normalizes Netflix to Netflix", () => {
            expect(
                normalizeMerchantName("Netflix"),
            ).toBe("Netflix");
        });

        it("normalizes Swiggy with canonical casing", () => {
            expect(
                normalizeMerchantName("swiggy"),
            ).toBe("Swiggy");
        });

        it("normalizes SWIGGY LIMITED to Swiggy", () => {
            expect(
                normalizeMerchantName(
                    "SWIGGY LIMITED",
                ),
            ).toBe("Swiggy");
        });

        it("normalizes Amazon with canonical casing", () => {
            expect(
                normalizeMerchantName("amazon"),
            ).toBe("Amazon");
        });

        it("normalizes AMZN to Amazon", () => {
            expect(
                normalizeMerchantName("AMZN"),
            ).toBe("Amazon");
        });

        it("normalizes Flipkart with canonical casing", () => {
            expect(
                normalizeMerchantName("flipkart"),
            ).toBe("Flipkart");
        });
    });

    describe("transaction and payment prefixes", () => {
        it("removes POS prefix", () => {
            expect(
                normalizeMerchantName(
                    "POS NETFLIX",
                ),
            ).toBe("Netflix");
        });

        it("removes UPI prefix", () => {
            expect(
                normalizeMerchantName(
                    "UPI SWIGGY",
                ),
            ).toBe("Swiggy");
        });

        it("removes ECOM prefix", () => {
            expect(
                normalizeMerchantName(
                    "ECOM AMAZON",
                ),
            ).toBe("Amazon");
        });

        it("removes payment gateway prefix", () => {
            expect(
                normalizeMerchantName(
                    "RAZORPAY SWIGGY",
                ),
            ).toBe("Swiggy");
        });
    });

    describe("UPI and payment handles", () => {
        it("removes UPI handle", () => {
            expect(
                normalizeMerchantName(
                    "swiggy@icici",
                ),
            ).toBe("Swiggy");
        });

        it("removes payment handle from a transaction", () => {
            expect(
                normalizeMerchantName(
                    "POS.NETFLIX@INDUS",
                ),
            ).toBe("Netflix");
        });
    });

    describe("legal suffixes", () => {
        it("removes PRIVATE LIMITED", () => {
            expect(
                normalizeMerchantName(
                    "SWIGGY PRIVATE LIMITED",
                ),
            ).toBe("Swiggy");
        });

        it("removes PVT LTD", () => {
            expect(
                normalizeMerchantName(
                    "AMAZON PVT LTD",
                ),
            ).toBe("Amazon");
        });

        it("removes LIMITED", () => {
            expect(
                normalizeMerchantName(
                    "FLIPKART LIMITED",
                ),
            ).toBe("Flipkart");
        });
    });

    describe("unknown merchants", () => {
        it("title-cases an unknown merchant", () => {
            expect(
                normalizeMerchantName(
                    "starbucks",
                ),
            ).toBe("Starbucks");
        });

        it("title-cases multiple words", () => {
            expect(
                normalizeMerchantName(
                    "some new store",
                ),
            ).toBe("Some New Store");
        });

        it("normalizes hyphenated merchant names", () => {
            expect(
                normalizeMerchantName(
                    "some-new-store",
                ),
            ).toBe("Some New Store");
        });

        it("removes duplicate words", () => {
            expect(
                normalizeMerchantName(
                    "test test store",
                ),
            ).toBe("Test Store");
        });
    });

    describe("special brand casing", () => {
        it("preserves YouTube casing", () => {
            expect(
                normalizeMerchantName(
                    "youtube",
                ),
            ).toBe("YouTube");
        });

        it("preserves known Spotify casing", () => {
            expect(
                normalizeMerchantName(
                    "spotify",
                ),
            ).toBe("Spotify");
        });

        it("preserves known Google casing", () => {
            expect(
                normalizeMerchantName(
                    "google",
                ),
            ).toBe("Google");
        });
    });

    describe("transaction references", () => {

        it("rejects UPI P2M reference without merchant", () => {
            expect(
                normalizeMerchantName(
                    "P2M 660615862577",
                ),
            ).toBe("");
        });


        it("rejects UPI P2A reference without merchant", () => {
            expect(
                normalizeMerchantName(
                    "P2A 624207512807",
                ),
            ).toBe("");
        });


        it("rejects UPI P2M reference with UPI prefix", () => {
            expect(
                normalizeMerchantName(
                    "UPI P2M 660615862577",
                ),
            ).toBe("");
        });


        it("rejects UPI P2A reference with UPI prefix", () => {
            expect(
                normalizeMerchantName(
                    "UPI P2A 624207512807",
                ),
            ).toBe("");
        });


        it("rejects slash-form UPI P2M reference", () => {
            expect(
                normalizeMerchantName(
                    "UPI/P2M/660615862577",
                ),
            ).toBe("");
        });


        it("rejects slash-form UPI P2A reference", () => {
            expect(
                normalizeMerchantName(
                    "UPI/P2A/624207512807",
                ),
            ).toBe("");
        });


        it("rejects a bare numeric transaction reference", () => {
            expect(
                normalizeMerchantName(
                    "660615862577",
                ),
            ).toBe("");
        });


        it("keeps a real UPI counterparty", () => {
            expect(
                normalizeMerchantName(
                    "SHAKILA THAPA",
                ),
            ).toBe("Shakila Thapa");
        });


        it("keeps a real multi-word UPI counterparty", () => {
            expect(
                normalizeMerchantName(
                    "BAJARANGI KUMAR",
                ),
            ).toBe("Bajarangi Kumar");
        });
    });
});