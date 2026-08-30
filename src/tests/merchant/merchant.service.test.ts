import {beforeEach, describe, expect, it, vi} from "vitest";

import {CategoryAssignmentSource, MerchantMappingSource, TransactionType,} from "@prisma/client";

import {prisma} from "../../database/prisma";

import {categorizeMerchantWithAI, resolveMerchantWithAI,} from "../../modules/merchant/merchant.ai";

import {
    categorizeMerchant,
    resolveMerchant,
    resolveTransactionMerchant,
} from "../../modules/merchant/merchant.service";

vi.mock("../../database/prisma", () => ({
    prisma: {
        merchant: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },

        merchantAlias: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },

        merchantMapping: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },

        category: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
        },
    },
}));

vi.mock("../../modules/merchant/merchant.ai", () => ({
    resolveMerchantWithAI: vi.fn(),
    categorizeMerchantWithAI: vi.fn(),
}));

describe("categorizeMerchant", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("uses an existing USER merchant mapping", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const category = {
            id: "category-1",
            name: "Shopping",
            type: TransactionType.EXPENSE,
            parentId: null,
            userId: "user-1",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchantMapping.findUnique)
            .mockResolvedValueOnce({
                id: "mapping-1",
                userId: "user-1",
                merchantId: merchant.id,
                categoryId: category.id,
                source: MerchantMappingSource.USER,
                confidence: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                category,
            } as any);

        const result = await categorizeMerchant({
            userId: "user-1",
            merchant,
            transactionType: TransactionType.EXPENSE,
        });

        expect(result).toEqual({
            merchant,
            category,
            confidence: 1,
            categoryAssignmentSource:
            CategoryAssignmentSource.USER,
            fromCache: true,
            reasoning: "Previously categorized.",
        });

        expect(categorizeMerchantWithAI)
            .not.toHaveBeenCalled();
    });

    it("uses an existing AI mapping as LEARNED", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const category = {
            id: "category-1",
            name: "Shopping",
            type: TransactionType.EXPENSE,
            parentId: null,
            userId: "user-1",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchantMapping.findUnique)
            .mockResolvedValueOnce({
                id: "mapping-1",
                userId: "user-1",
                merchantId: merchant.id,
                categoryId: category.id,
                source: MerchantMappingSource.AI,
                confidence: 0.91,
                createdAt: new Date(),
                updatedAt: new Date(),
                category,
            } as any);

        const result = await categorizeMerchant({
            userId: "user-1",
            merchant,
            transactionType: TransactionType.EXPENSE,
        });

        expect(result).toEqual({
            merchant,
            category,
            confidence: 0.91,
            categoryAssignmentSource:
            CategoryAssignmentSource.LEARNED,
            fromCache: true,
            reasoning: "Previously categorized.",
        });

        expect(categorizeMerchantWithAI)
            .not.toHaveBeenCalled();
    });

    it("uses an existing mapping when confidence is null", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const category = {
            id: "category-1",
            name: "Shopping",
            type: TransactionType.EXPENSE,
            parentId: null,
            userId: "user-1",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchantMapping.findUnique)
            .mockResolvedValueOnce({
                id: "mapping-1",
                userId: "user-1",
                merchantId: merchant.id,
                categoryId: category.id,
                source: MerchantMappingSource.AI,
                confidence: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                category,
            } as any);

        const result = await categorizeMerchant({
            userId: "user-1",
            merchant,
            transactionType: TransactionType.EXPENSE,
        });

        expect(result.category)
            .toEqual(category);

        expect(result.confidence)
            .toBe(1);

        expect(result.categoryAssignmentSource)
            .toBe(CategoryAssignmentSource.LEARNED);

        expect(result.fromCache)
            .toBe(true);

        expect(result.reasoning)
            .toBe("Previously categorized.");

        expect(categorizeMerchantWithAI)
            .not.toHaveBeenCalled();
    });

    it("ignores a mapping for the wrong transaction type", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const wrongCategory = {
            id: "category-income",
            name: "Salary",
            type: TransactionType.INCOME,
            parentId: null,
            userId: "user-1",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchantMapping.findUnique)
            .mockResolvedValueOnce({
                id: "mapping-1",
                userId: "user-1",
                merchantId: merchant.id,
                categoryId: wrongCategory.id,
                source: MerchantMappingSource.AI,
                confidence: 0.9,
                createdAt: new Date(),
                updatedAt: new Date(),
                category: wrongCategory,
            } as any);

        vi.mocked(prisma.category.findMany)
            .mockResolvedValueOnce([]);

        await expect(
            categorizeMerchant({
                userId: "user-1",
                merchant,
                transactionType: TransactionType.EXPENSE,
            }),
        ).rejects.toThrow(
            "No EXPENSE categories found.",
        );

        expect(categorizeMerchantWithAI)
            .not.toHaveBeenCalled();
    });

    it("throws when no categories exist", async () => {
        const merchant = {
            id: "merchant-1",
            name: "unknown",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchantMapping.findUnique)
            .mockResolvedValueOnce(null);

        vi.mocked(prisma.category.findMany)
            .mockResolvedValueOnce([]);

        await expect(
            categorizeMerchant({
                userId: "user-1",
                merchant,
                transactionType: TransactionType.EXPENSE,
            }),
        ).rejects.toThrow(
            "No EXPENSE categories found.",
        );

        expect(categorizeMerchantWithAI)
            .not.toHaveBeenCalled();
    });

    it("uses AI to categorize a merchant", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const category = {
            id: "category-1",
            name: "Shopping",
            type: TransactionType.EXPENSE,
            parentId: null,
            userId: "user-1",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchantMapping.findUnique)
            .mockResolvedValueOnce(null);

        vi.mocked(prisma.category.findMany)
            .mockResolvedValueOnce([category]);

        vi.mocked(categorizeMerchantWithAI)
            .mockResolvedValueOnce({
                categoryId: category.id,
                confidence: 0.94,
                reasoning: "Online retail merchant.",
            });

        vi.mocked(prisma.category.findFirst)
            .mockResolvedValueOnce(category);

        vi.mocked(prisma.merchantMapping.upsert)
            .mockResolvedValueOnce({
                id: "mapping-1",
                userId: "user-1",
                merchantId: merchant.id,
                categoryId: category.id,
                source: MerchantMappingSource.AI,
                confidence: 0.94,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any);

        const result = await categorizeMerchant({
            userId: "user-1",
            merchant,
            transactionType: TransactionType.EXPENSE,
        });

        expect(result.category)
            .toEqual(category);

        expect(result.confidence)
            .toBe(0.94);

        expect(result.categoryAssignmentSource)
            .toBe(CategoryAssignmentSource.AI);

        expect(result.fromCache)
            .toBe(false);

        expect(result.reasoning)
            .toBe("Online retail merchant.");

        expect(categorizeMerchantWithAI)
            .toHaveBeenCalledWith(
                "amazon",
                TransactionType.EXPENSE,
                expect.any(Array),
            );
    });

    it("rejects an invalid category returned by AI", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const categoryOption = {
            id: "category-1",
            name: "Shopping",
            path: "Shopping",
            type: TransactionType.EXPENSE,
        };

        vi.mocked(prisma.merchantMapping.findUnique)
            .mockResolvedValueOnce(null);

        vi.mocked(prisma.category.findMany)
            .mockResolvedValueOnce([
                categoryOption as any,
            ]);

        vi.mocked(categorizeMerchantWithAI)
            .mockResolvedValueOnce({
                categoryId: "does-not-exist",
                confidence: 0.8,
                reasoning: "Unknown",
            });

        vi.mocked(prisma.category.findFirst)
            .mockResolvedValueOnce(null);

        await expect(
            categorizeMerchant({
                userId: "user-1",
                merchant,
                transactionType: TransactionType.EXPENSE,
            }),
        ).rejects.toThrow(
            "AI returned an invalid category.",
        );
    });

    it("does not create a mapping when AI returns an invalid category", async () => {
        const merchant = {
            id: "merchant-1",
            name: "unknown",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const categoryOption = {
            id: "category-1",
            name: "Shopping",
            path: "Shopping",
            type: TransactionType.EXPENSE,
        };

        vi.mocked(prisma.merchantMapping.findUnique)
            .mockResolvedValueOnce(null);

        vi.mocked(prisma.category.findMany)
            .mockResolvedValueOnce([
                categoryOption as any,
            ]);

        vi.mocked(categorizeMerchantWithAI)
            .mockResolvedValueOnce({
                categoryId: "invalid-category",
                confidence: 0.8,
                reasoning: "Unknown",
            });

        vi.mocked(prisma.category.findFirst)
            .mockResolvedValueOnce(null);

        await expect(
            categorizeMerchant({
                userId: "user-1",
                merchant,
                transactionType: TransactionType.EXPENSE,
            }),
        ).rejects.toThrow(
            "AI returned an invalid category.",
        );

        expect(prisma.merchantMapping.upsert)
            .not.toHaveBeenCalled();
    });

    it("propagates AI categorization errors", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const category = {
            id: "category-1",
            name: "Shopping",
            type: TransactionType.EXPENSE,
            parentId: null,
            userId: "user-1",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchantMapping.findUnique)
            .mockResolvedValueOnce(null);

        vi.mocked(prisma.category.findMany)
            .mockResolvedValueOnce([category]);

        vi.mocked(categorizeMerchantWithAI)
            .mockRejectedValueOnce(
                new Error("AI categorization failed"),
            );

        await expect(
            categorizeMerchant({
                userId: "user-1",
                merchant,
                transactionType: TransactionType.EXPENSE,
            }),
        ).rejects.toThrow(
            "AI categorization failed",
        );

        expect(prisma.merchantMapping.upsert)
            .not.toHaveBeenCalled();
    });

    it("does not call AI when an existing mapping matches the transaction type", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const category = {
            id: "category-1",
            name: "Shopping",
            type: TransactionType.EXPENSE,
            parentId: null,
            userId: "user-1",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchantMapping.findUnique)
            .mockResolvedValueOnce({
                id: "mapping-1",
                userId: "user-1",
                merchantId: merchant.id,
                categoryId: category.id,
                source: MerchantMappingSource.USER,
                confidence: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                category,
            } as any);

        const result = await categorizeMerchant({
            userId: "user-1",
            merchant,
            transactionType: TransactionType.EXPENSE,
        });

        expect(result.category)
            .toEqual(category);

        expect(result.categoryAssignmentSource)
            .toBe(CategoryAssignmentSource.USER);

        expect(result.fromCache)
            .toBe(true);

        expect(categorizeMerchantWithAI)
            .not.toHaveBeenCalled();
    });
});

describe("resolveTransactionMerchant", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("returns an empty result when merchant is missing", async () => {
        const result = await resolveTransactionMerchant({
            userId: "user-1",
            merchantRaw: "   ",
            transactionType: TransactionType.EXPENSE,
        });

        expect(result).toEqual({
            merchant: null,
            merchantId: null,
            merchantRaw: null,
            merchantNormalized: null,
            category: null,
            categoryId: null,
            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,
            confidence: null,
        });
    });

    it("returns an empty result when merchantRaw is null", async () => {
        const result = await resolveTransactionMerchant({
            userId: "user-1",
            merchantRaw: null,
            transactionType: TransactionType.EXPENSE,
        });

        expect(result).toEqual({
            merchant: null,
            merchantId: null,
            merchantRaw: null,
            merchantNormalized: null,
            category: null,
            categoryId: null,
            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,
            confidence: null,
        });
    });

    it("resolves merchant without categorization when shouldCategorize is false", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValueOnce(merchant);

        const result = await resolveTransactionMerchant({
            userId: "user-1",
            merchantRaw: "amazon",
            transactionType: TransactionType.EXPENSE,
            shouldCategorize: false,
        });

        expect(result).toEqual({
            merchant,
            merchantId: "merchant-1",
            merchantRaw: "amazon",
            merchantNormalized: "amazon",
            category: null,
            categoryId: null,
            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,
            confidence: 1,
        });

        expect(categorizeMerchantWithAI)
            .not.toHaveBeenCalled();
    });

    it("categorizes an expense when shouldCategorize is true", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const category = {
            id: "category-1",
            name: "Shopping",
            type: TransactionType.EXPENSE,
            parentId: null,
            userId: "user-1",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValueOnce(merchant);

        vi.mocked(prisma.merchantMapping.findUnique)
            .mockResolvedValueOnce({
                id: "mapping-1",
                userId: "user-1",
                merchantId: merchant.id,
                categoryId: category.id,
                source: MerchantMappingSource.USER,
                confidence: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                category,
            } as any);

        const result = await resolveTransactionMerchant({
            userId: "user-1",
            merchantRaw: "amazon",
            transactionType: TransactionType.EXPENSE,
            shouldCategorize: true,
        });

        expect(result).toEqual({
            merchant,
            merchantId: "merchant-1",
            merchantRaw: "amazon",
            merchantNormalized: "amazon",
            category,
            categoryId: category.id,
            categoryAssignmentSource:
            CategoryAssignmentSource.USER,
            confidence: 1,
        });

        expect(categorizeMerchantWithAI)
            .not.toHaveBeenCalled();
    });

    it("categorizes income transactions", async () => {
        const merchant = {
            id: "merchant-1",
            name: "salary",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const category = {
            id: "category-income",
            name: "Salary",
            type: TransactionType.INCOME,
            parentId: null,
            userId: "user-1",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValueOnce(merchant);

        vi.mocked(prisma.merchantMapping.findUnique)
            .mockResolvedValueOnce({
                id: "mapping-1",
                userId: "user-1",
                merchantId: merchant.id,
                categoryId: category.id,
                source: MerchantMappingSource.USER,
                confidence: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                category,
            } as any);

        const result = await resolveTransactionMerchant({
            userId: "user-1",
            merchantRaw: "salary",
            transactionType: TransactionType.INCOME,
            shouldCategorize: true,
        });

        expect(result.category)
            .toEqual(category);

        expect(result.categoryId)
            .toBe(category.id);

        expect(result.categoryAssignmentSource)
            .toBe(CategoryAssignmentSource.USER);

        expect(result.confidence)
            .toBe(1);
    });

    it("does not categorize transfers even when requested", async () => {
        const merchant = {
            id: "merchant-1",
            name: "bank",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValueOnce(merchant);

        const result = await resolveTransactionMerchant({
            userId: "user-1",
            merchantRaw: "bank",
            transactionType: TransactionType.TRANSFER,
            shouldCategorize: true,
        });

        expect(result).toEqual({
            merchant,
            merchantId: "merchant-1",
            merchantRaw: "bank",
            merchantNormalized: "bank",
            category: null,
            categoryId: null,
            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,
            confidence: 1,
        });

        expect(categorizeMerchantWithAI)
            .not.toHaveBeenCalled();

        expect(prisma.merchantMapping.findUnique)
            .not.toHaveBeenCalled();
    });

    it("returns resolved merchant when categorization fails", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValueOnce(merchant);

        vi.mocked(prisma.merchantMapping.findUnique)
            .mockResolvedValueOnce(null);

        vi.mocked(prisma.category.findMany)
            .mockResolvedValueOnce([
                {
                    id: "category-1",
                    name: "Shopping",
                    type: TransactionType.EXPENSE,
                    parentId: null,
                    userId: "user-1",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ]);

        vi.mocked(categorizeMerchantWithAI)
            .mockRejectedValueOnce(
                new Error("AI categorization failed"),
            );

        const result = await resolveTransactionMerchant({
            userId: "user-1",
            merchantRaw: "amazon",
            transactionType: TransactionType.EXPENSE,
        });

        expect(result).toEqual({
            merchant,
            merchantId: "merchant-1",
            merchantRaw: "amazon",
            merchantNormalized: "amazon",
            category: null,
            categoryId: null,
            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,
            confidence: 1,
        });
    });

    it("returns an empty merchant result when merchant resolution fails", async () => {
        vi.mocked(prisma.merchant.findUnique)
            .mockRejectedValueOnce(
                new Error("Database unavailable"),
            );

        const result = await resolveTransactionMerchant({
            userId: "user-1",
            merchantRaw: "amazon",
            transactionType: TransactionType.EXPENSE,
            shouldCategorize: false,
        });

        expect(result).toEqual({
            merchant: null,
            merchantId: null,
            merchantRaw: "amazon",
            merchantNormalized: "Amazon",
            category: null,
            categoryId: null,
            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,
            confidence: null,
        });
    });

    it("preserves the normalized raw merchant value", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValueOnce(merchant);

        const result = await resolveTransactionMerchant({
            userId: "user-1",
            merchantRaw: "  amazon  ",
            transactionType: TransactionType.EXPENSE,
            shouldCategorize: false,
        });

        expect(result.merchantRaw)
            .toBe("amazon");

        expect(result.merchantNormalized)
            .toBe("amazon");

        expect(result.merchantId)
            .toBe("merchant-1");

        expect(result.merchant)
            .toEqual(merchant);
    });
});

describe("resolveMerchant", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("rejects an empty merchant name", async () => {
        await expect(
            resolveMerchant(""),
        ).rejects.toThrow(
            "Unable to normalize merchant name.",
        );

        expect(resolveMerchantWithAI)
            .not.toHaveBeenCalled();
    });

    it("rejects a whitespace-only merchant name", async () => {
        await expect(
            resolveMerchant("   "),
        ).rejects.toThrow(
            "Unable to normalize merchant name.",
        );

        expect(resolveMerchantWithAI)
            .not.toHaveBeenCalled();
    });

    it("resolves an existing merchant from canonical name", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValueOnce(merchant);

        const result =
            await resolveMerchant("amazon");

        expect(result).toEqual({
            merchant,
            normalizedName: "amazon",
            confidence: 1,
            fromCache: true,
        });

        expect(
            prisma.merchant.findUnique,
        ).toHaveBeenCalledWith({
            where: {
                name: "Amazon",
            },
            include: {
                aliases: true,
            },
        });

        expect(
            resolveMerchantWithAI,
        ).not.toHaveBeenCalled();
    });

    it("resolves an existing merchant from alias", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const alias = {
            id: "alias-1",
            alias: "amazon.in",
            merchantId: merchant.id,
            createdAt: new Date(),
            updatedAt: new Date(),
            merchant,
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValueOnce(null);

        vi.mocked(prisma.merchantAlias.findUnique)
            .mockResolvedValueOnce(alias);

        const result =
            await resolveMerchant("amazon.in");

        expect(result).toEqual({
            merchant,
            normalizedName: "amazon",
            confidence: 1,
            fromCache: true,
        });

        expect(
            resolveMerchantWithAI,
        ).not.toHaveBeenCalled();
    });

    it("normalizes input before performing merchant lookup", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValueOnce(merchant);

        const result =
            await resolveMerchant("  AMAZON  ");

        expect(result).toEqual({
            merchant,
            normalizedName: "amazon",
            confidence: 1,
            fromCache: true,
        });

        expect(
            prisma.merchant.findUnique,
        ).toHaveBeenCalledWith({
            where: {
                name: "Amazon",
            },
            include: {
                aliases: true,
            },
        });

        expect(
            resolveMerchantWithAI,
        ).not.toHaveBeenCalled();
    });

    it("resolves a new merchant using AI", async () => {
        const merchantName =
            "pos.amazon@indus";

        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValue(null);

        vi.mocked(prisma.merchantAlias.findUnique)
            .mockResolvedValue(null);

        vi.mocked(resolveMerchantWithAI)
            .mockResolvedValueOnce({
                merchant: "Amazon",
                confidence: 0.95,
            });

        vi.mocked(prisma.merchant.upsert)
            .mockResolvedValueOnce(merchant);

        vi.mocked(prisma.merchantAlias.upsert)
            .mockResolvedValueOnce({
                id: "alias-1",
                alias: merchantName,
                merchantId: merchant.id,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

        const result =
            await resolveMerchant(merchantName);

        expect(result).toEqual({
            merchant,
            normalizedName: "amazon",
            confidence: 0.95,
            fromCache: false,
        });

        expect(
            resolveMerchantWithAI,
        ).toHaveBeenCalledWith(
            merchantName,
        );

        expect(
            prisma.merchant.upsert,
        ).toHaveBeenCalledWith({
            where: {
                name: "Amazon",
            },
            update: {},
            create: {
                name: "Amazon",
            },
        });

        expect(
            prisma.merchantAlias.upsert,
        ).toHaveBeenCalled();
    });

    it("normalizes the merchant returned by AI", async () => {
        const merchantName =
            "pos.amazon.store@indus";

        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValue(null);

        vi.mocked(prisma.merchantAlias.findUnique)
            .mockResolvedValue(null);

        vi.mocked(resolveMerchantWithAI)
            .mockResolvedValueOnce({
                merchant: "  AMAZON  ",
                confidence: 0.91,
            });

        vi.mocked(prisma.merchant.upsert)
            .mockResolvedValueOnce(merchant);

        vi.mocked(prisma.merchantAlias.upsert)
            .mockResolvedValueOnce({
                id: "alias-1",
                alias: merchantName,
                merchantId: merchant.id,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

        const result =
            await resolveMerchant(merchantName);

        expect(result.merchant)
            .toEqual(merchant);

        expect(result.normalizedName)
            .toBe("amazon");

        expect(result.confidence)
            .toBe(0.91);

        expect(result.fromCache)
            .toBe(false);

        expect(
            prisma.merchant.upsert,
        ).toHaveBeenCalledWith({
            where: {
                name: "Amazon",
            },
            update: {},
            create: {
                name: "Amazon",
            },
        });

        expect(
            prisma.merchantAlias.upsert,
        ).toHaveBeenCalled();
    });

    it("falls back to the normalized merchant when AI returns an empty merchant", async () => {
        const merchantName =
            "pos.11329019@indus";

        const merchant = {
            id: "merchant-1",
            name: "11329019",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValue(null);

        vi.mocked(prisma.merchantAlias.findUnique)
            .mockResolvedValue(null);

        vi.mocked(resolveMerchantWithAI)
            .mockResolvedValueOnce({
                merchant: "   ",
                confidence: 0.9,
            });

        vi.mocked(prisma.merchant.upsert)
            .mockResolvedValueOnce(merchant);

        vi.mocked(prisma.merchantAlias.upsert)
            .mockResolvedValueOnce({
                id: "alias-1",
                alias: merchantName,
                merchantId: merchant.id,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

        const result =
            await resolveMerchant(merchantName);

        expect(result).toEqual({
            merchant,
            normalizedName: "11329019",
            confidence: 0,
            fromCache: false,
        });

        expect(
            resolveMerchantWithAI,
        ).toHaveBeenCalledWith(
            merchantName,
        );
    });

    it("falls back to the normalized merchant when AI resolution throws", async () => {
        const merchantName =
            "pos.11329019@indus";

        const merchant = {
            id: "merchant-1",
            name: "11329019",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValue(null);

        vi.mocked(prisma.merchantAlias.findUnique)
            .mockResolvedValue(null);

        vi.mocked(resolveMerchantWithAI)
            .mockRejectedValueOnce(
                new Error("AI unavailable"),
            );

        vi.mocked(prisma.merchant.upsert)
            .mockResolvedValueOnce(merchant);

        vi.mocked(prisma.merchantAlias.upsert)
            .mockResolvedValueOnce({
                id: "alias-1",
                alias: merchantName,
                merchantId: merchant.id,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

        const result =
            await resolveMerchant(merchantName);

        expect(result).toEqual({
            merchant,
            normalizedName: "11329019",
            confidence: 0,
            fromCache: false,
        });

        expect(
            resolveMerchantWithAI,
        ).toHaveBeenCalledWith(
            merchantName,
        );

        expect(
            prisma.merchant.upsert,
        ).toHaveBeenCalled();

        expect(
            prisma.merchantAlias.upsert,
        ).toHaveBeenCalled();
    });

    it("preserves low AI confidence", async () => {
        const merchantName =
            "unknown-store@indus";

        const merchant = {
            id: "merchant-1",
            name: "unknown-store",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValue(null);

        vi.mocked(prisma.merchantAlias.findUnique)
            .mockResolvedValue(null);

        vi.mocked(resolveMerchantWithAI)
            .mockResolvedValueOnce({
                merchant: "unknown-store",
                confidence: 0.21,
            });

        vi.mocked(prisma.merchant.upsert)
            .mockResolvedValueOnce(merchant);

        vi.mocked(prisma.merchantAlias.upsert)
            .mockResolvedValueOnce({
                id: "alias-1",
                alias: merchantName,
                merchantId: merchant.id,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

        const result =
            await resolveMerchant(merchantName);

        expect(result.confidence)
            .toBe(0.21);

        expect(result.fromCache)
            .toBe(false);
    });

    it("accepts zero AI confidence", async () => {
        const merchantName =
            "unknown-zero@indus";

        const merchant = {
            id: "merchant-1",
            name: "unknown-zero",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValue(null);

        vi.mocked(prisma.merchantAlias.findUnique)
            .mockResolvedValue(null);

        vi.mocked(resolveMerchantWithAI)
            .mockResolvedValueOnce({
                merchant: "unknown-zero",
                confidence: 0,
            });

        vi.mocked(prisma.merchant.upsert)
            .mockResolvedValueOnce(merchant);

        vi.mocked(prisma.merchantAlias.upsert)
            .mockResolvedValueOnce({
                id: "alias-1",
                alias: merchantName,
                merchantId: merchant.id,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

        const result =
            await resolveMerchant(merchantName);

        expect(result.confidence)
            .toBe(0);

        expect(result.fromCache)
            .toBe(false);
    });

    it("does not call AI when canonical merchant exists", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValueOnce(merchant);

        const result =
            await resolveMerchant("amazon");

        expect(result.merchant)
            .toEqual(merchant);

        expect(result.fromCache)
            .toBe(true);

        expect(resolveMerchantWithAI)
            .not.toHaveBeenCalled();

        expect(prisma.merchant.upsert)
            .not.toHaveBeenCalled();

        expect(prisma.merchantAlias.upsert)
            .not.toHaveBeenCalled();
    });

    it("does not call AI when alias exists", async () => {
        const merchant = {
            id: "merchant-1",
            name: "amazon",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const alias = {
            id: "alias-1",
            alias: "amazon.in",
            merchantId: merchant.id,
            createdAt: new Date(),
            updatedAt: new Date(),
            merchant,
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValueOnce(null);

        vi.mocked(prisma.merchantAlias.findUnique)
            .mockResolvedValueOnce(alias);

        const result =
            await resolveMerchant("amazon.in");

        expect(result.merchant)
            .toEqual(merchant);

        expect(result.normalizedName)
            .toBe("amazon");

        expect(result.fromCache)
            .toBe(true);

        expect(resolveMerchantWithAI)
            .not.toHaveBeenCalled();
    });

    it("does not create an alias when merchant resolution fails before persistence", async () => {
        vi.mocked(prisma.merchant.findUnique)
            .mockRejectedValueOnce(
                new Error("Database unavailable"),
            );

        await expect(
            resolveMerchant("amazon"),
        ).rejects.toThrow(
            "Database unavailable",
        );

        expect(
            resolveMerchantWithAI,
        ).not.toHaveBeenCalled();

        expect(
            prisma.merchantAlias.upsert,
        ).not.toHaveBeenCalled();
    });

    it("deduplicates concurrent merchant resolution", async () => {
        const merchantName =
            "pos.concurrent-store@indus";

        const merchant = {
            id: "merchant-1",
            name: "concurrent-store",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.merchant.findUnique)
            .mockResolvedValue(null);

        vi.mocked(prisma.merchantAlias.findUnique)
            .mockResolvedValue(null);

        let resolveAI:
            | ((
            value: {
                merchant: string;
                confidence: number;
            },
        ) => void)
            | undefined;

        vi.mocked(resolveMerchantWithAI)
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveAI = resolve;
                    }),
            );

        vi.mocked(prisma.merchant.upsert)
            .mockResolvedValue(merchant);

        vi.mocked(prisma.merchantAlias.upsert)
            .mockResolvedValue({
                id: "alias-1",
                alias: merchantName,
                merchantId: merchant.id,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

        const firstPromise =
            resolveMerchant(merchantName);

        const secondPromise =
            resolveMerchant(merchantName);

        await new Promise((resolve) =>
            setTimeout(resolve, 0),
        );

        expect(resolveMerchantWithAI)
            .toHaveBeenCalledTimes(1);

        resolveAI?.({
            merchant: "concurrent-store",
            confidence: 0.95,
        });

        const [first, second] =
            await Promise.all([
                firstPromise,
                secondPromise,
            ]);

        expect(first)
            .toEqual(second);

        expect(first).toEqual({
            merchant,
            normalizedName: "concurrent-store",
            confidence: 0.95,
            fromCache: false,
        });

        expect(resolveMerchantWithAI)
            .toHaveBeenCalledTimes(1);
    });
});