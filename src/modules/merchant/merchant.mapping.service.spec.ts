import {beforeEach, describe, expect, it, vi} from "vitest";
import {MerchantMappingSource} from "@prisma/client";
import {prisma} from "../../database/prisma";
import {upsertMerchantMapping} from "./merchant.mapping.service";

vi.mock("../../database/prisma", () => ({
    prisma: {
        merchantMapping: {
            upsert: vi.fn(),
        },
    },
}));

const upsertMock = vi.mocked(prisma.merchantMapping.upsert);

describe("upsertMerchantMapping", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        upsertMock.mockResolvedValue({
            id: "mapping-1",
            userId: "user-1",
            normalizedName: "swiggy",
            displayName: "Swiggy",
            categoryId: "cat-food",
            source: MerchantMappingSource.AI,
            confidence: 0.9,
            category: {
                id: "cat-food",
            },
        } as any);
    });

    it("creates or updates a merchant mapping", async () => {
        const result = await upsertMerchantMapping({
            userId: "user-1",
            merchant: "Swiggy",
            normalizedName: "swiggy",
            categoryId: "cat-food",
            source: MerchantMappingSource.AI,
            confidence: 0.9,
        });

        expect(upsertMock).toHaveBeenCalledTimes(1);

        expect(upsertMock).toHaveBeenCalledWith({
            where: {
                userId_normalizedName: {
                    userId: "user-1",
                    normalizedName: "swiggy",
                },
            },
            update: {
                displayName: "Swiggy",
                categoryId: "cat-food",
                source: MerchantMappingSource.AI,
                confidence: 0.9,
            },
            create: {
                userId: "user-1",
                normalizedName: "swiggy",
                displayName: "Swiggy",
                categoryId: "cat-food",
                source: MerchantMappingSource.AI,
                confidence: 0.9,
            },
            include: {
                category: true,
            },
        });

        expect(result.id).toBe("mapping-1");
    });

    it("trims the merchant display name", async () => {
        await upsertMerchantMapping({
            userId: "user-1",
            merchant: "   Swiggy   ",
            normalizedName: "swiggy",
            categoryId: "cat-food",
            source: MerchantMappingSource.AI,
            confidence: 0.75,
        });

        expect(upsertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                update: expect.objectContaining({
                    displayName: "Swiggy",
                }),
                create: expect.objectContaining({
                    displayName: "Swiggy",
                }),
            }),
        );
    });

    it("defaults confidence to 1", async () => {
        await upsertMerchantMapping({
            userId: "user-1",
            merchant: "Swiggy",
            normalizedName: "swiggy",
            categoryId: "cat-food",
            source: MerchantMappingSource.USER,
        });

        expect(upsertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                update: expect.objectContaining({
                    confidence: 1,
                }),
                create: expect.objectContaining({
                    confidence: 1,
                }),
            }),
        );
    });

    it("clamps confidence below 0", async () => {
        await upsertMerchantMapping({
            userId: "user-1",
            merchant: "Swiggy",
            normalizedName: "swiggy",
            categoryId: "cat-food",
            source: MerchantMappingSource.AI,
            confidence: -2,
        });

        expect(upsertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                update: expect.objectContaining({
                    confidence: 0,
                }),
                create: expect.objectContaining({
                    confidence: 0,
                }),
            }),
        );
    });

    it("clamps confidence above 1", async () => {
        await upsertMerchantMapping({
            userId: "user-1",
            merchant: "Swiggy",
            normalizedName: "swiggy",
            categoryId: "cat-food",
            source: MerchantMappingSource.AI,
            confidence: 5,
        });

        expect(upsertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                update: expect.objectContaining({
                    confidence: 1,
                }),
                create: expect.objectContaining({
                    confidence: 1,
                }),
            }),
        );
    });

    it("throws when normalizedName is empty", async () => {
        await expect(
            upsertMerchantMapping({
                userId: "user-1",
                merchant: "Swiggy",
                normalizedName: "",
                categoryId: "cat-food",
                source: MerchantMappingSource.AI,
            }),
        ).rejects.toThrow("normalizedName is required.");

        expect(upsertMock).not.toHaveBeenCalled();
    });

    it("throws when normalizedName contains only whitespace", async () => {
        await expect(
            upsertMerchantMapping({
                userId: "user-1",
                merchant: "Swiggy",
                normalizedName: "   ",
                categoryId: "cat-food",
                source: MerchantMappingSource.AI,
            }),
        ).rejects.toThrow("normalizedName is required.");

        expect(upsertMock).not.toHaveBeenCalled();
    });

    it("returns the prisma result unchanged", async () => {
        const mapping = {
            id: "mapping-42",
            userId: "user-1",
            normalizedName: "amazon",
            displayName: "Amazon",
            categoryId: "shopping",
            source: MerchantMappingSource.USER,
            confidence: 1,
            category: {
                id: "shopping",
            },
        };

        upsertMock.mockResolvedValue(mapping as any);

        const result = await upsertMerchantMapping({
            userId: "user-1",
            merchant: "Amazon",
            normalizedName: "amazon",
            categoryId: "shopping",
            source: MerchantMappingSource.USER,
        });

        expect(result).toEqual(mapping);
    });
});