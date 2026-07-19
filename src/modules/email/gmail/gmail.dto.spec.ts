import {describe, expect, it} from "vitest";
import {syncGmailSchema} from "./gmail.dto";

describe("syncGmailSchema", () => {
    it("accepts a page token and result limit", () => {
        expect(syncGmailSchema.parse({
            maxResults: 1,
            pageToken: "next-page"
        })).toEqual({
            maxResults: 1,
            pageToken: "next-page"
        });
    });

    it("rejects invalid result limits", () => {
        expect(() => syncGmailSchema.parse({maxResults: 0})).toThrow();
    });
});
