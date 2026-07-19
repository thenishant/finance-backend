import {describe, expect, it} from "vitest";
import {cleanEmailBody} from "./body-cleaner";

describe("cleanEmailBody", () => {
    it("converts HTML email content into parseable text", () => {
        expect(cleanEmailBody(
            "<p>Transaction Amount:&nbsp;<strong>INR 1,234.50</strong></p><p>Merchant Name: Coffee &amp; Co</p>"
        )).toBe("Transaction Amount: INR 1,234.50 Merchant Name: Coffee & Co");
    });
});
