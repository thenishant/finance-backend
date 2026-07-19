import {beforeEach, describe, expect, it, vi} from "vitest";
import {MerchantMappingSource, TransactionType,} from "@prisma/client";
import {prisma} from "../../database/prisma";
import {categorizeMerchant} from "./merchant.service";
import {categorizeMerchantWithAI} from "./merchant.ai";
import {getCategoryById, getMerchantCategoryTree,} from "./merchant.category";
import {upsertMerchantMapping} from "./merchant.mapping.service";
import {normalizeMerchantName} from "./merchant.normalizer";

vi.mock("../../database/prisma", () => ({
    prisma: {
        merchantMapping: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock("./merchant.ai", () => ({
    categorizeMerchantWithAI: vi.fn(),
}));

vi.mock("./merchant.category", () => ({
    getMerchantCategoryTree: vi.fn(),
    getCategoryById: vi.fn(),
}));

vi.mock("./merchant.mapping.service", () => ({
    upsertMerchantMapping: vi.fn(),
}));

vi.mock("./merchant.normalizer", () => ({
    normalizeMerchantName: vi.fn(),
}));

const findUniqueMock = vi.mocked(prisma.merchantMapping.findUnique);
const normalizeMock = vi.mocked(normalizeMerchantName);
const aiMock = vi.mocked(categorizeMerchantWithAI);
const treeMock = vi.mocked(getMerchantCategoryTree);
const categoryMock = vi.mocked(getCategoryById);
const upsertMock = vi.mocked(upsertMerchantMapping);

const expenseCategory = {
    id: "food",
    userId: "user-1",
    parentId: null,
    name: "Food",
    type: TransactionType.EXPENSE,
    createdAt: new Date(),
    updatedAt: new Date(),
} as const;

describe("categorizeMerchant", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        normalizeMock.mockReturnValue("swiggy");

        findUniqueMock.mockResolvedValue(null as any);

        treeMock.mockResolvedValue([
            {
                id: "food",
                name: "Food",
                type: TransactionType.EXPENSE,
                children: [],
            },
        ]);

        aiMock.mockResolvedValue({
            categoryId: "food",
            confidence: 0.91,
            reasoning: "Food delivery",
        });

        categoryMock.mockResolvedValue(expenseCategory as any);

        upsertMock.mockResolvedValue({
            id: "mapping-1",
            userId: "user-1",
            normalizedName: "swiggy",
            displayName: "Swiggy",
            categoryId: "food",
            source: MerchantMappingSource.AI,
            confidence: 0.91,
            createdAt: new Date(),
            updatedAt: new Date(),
            category: expenseCategory,
        } as any);
    });

    it("throws when merchant cannot be normalized", async () => {
        normalizeMock.mockReturnValue("");

        await expect(
            categorizeMerchant({
                userId: "user-1",
                merchantName: "???",
                transactionType: TransactionType.EXPENSE,
            }),
        ).rejects.toThrow(
            "Unable to normalize merchant name.",
        );

        expect(findUniqueMock).not.toHaveBeenCalled();
        expect(aiMock).not.toHaveBeenCalled();
    });

    it("returns cached category", async () => {
        findUniqueMock.mockResolvedValue({
            confidence: 0.88,
            category: expenseCategory,
        } as any);

        const result = await categorizeMerchant({
            userId: "user-1",
            merchantName: "Swiggy",
            transactionType: TransactionType.EXPENSE,
        });

        expect(result).toEqual({
            category: expenseCategory,
            confidence: 0.88,
            reasoning: "Merchant previously categorized.",
            fromCache: true,
        });

        expect(aiMock).not.toHaveBeenCalled();
        expect(treeMock).not.toHaveBeenCalled();
        expect(upsertMock).not.toHaveBeenCalled();
    });

    it("defaults cached confidence to 1", async () => {
        findUniqueMock.mockResolvedValue({
            confidence: null,
            category: expenseCategory,
        } as any);

        const result = await categorizeMerchant({
            userId: "user-1",
            merchantName: "Swiggy",
            transactionType: TransactionType.EXPENSE,
        });

        expect(result.confidence).toBe(1);
        expect(result.fromCache).toBe(true);
    });

    it("ignores cache when transaction type differs", async () => {
        findUniqueMock.mockResolvedValue({
            confidence: 1,
            category: {
                ...expenseCategory,
                type: TransactionType.INCOME,
            },
        } as any);

        await categorizeMerchant({
            userId: "user-1",
            merchantName: "Swiggy",
            transactionType: TransactionType.EXPENSE,
        });

        expect(treeMock).toHaveBeenCalledOnce();
        expect(aiMock).toHaveBeenCalledOnce();
        expect(upsertMock).toHaveBeenCalledOnce();
    });

    it("throws when no categories exist", async () => {
        treeMock.mockResolvedValue([]);

        await expect(
            categorizeMerchant({
                userId: "user-1",
                merchantName: "Swiggy",
                transactionType: TransactionType.EXPENSE,
            }),
        ).rejects.toThrow(
            "No EXPENSE categories found.",
        );

        expect(aiMock).not.toHaveBeenCalled();
        expect(categoryMock).not.toHaveBeenCalled();
        expect(upsertMock).not.toHaveBeenCalled();
    });

    it("throws when AI returns an invalid category", async () => {
        categoryMock.mockResolvedValue(null);

        await expect(
            categorizeMerchant({
                userId: "user-1",
                merchantName: "Swiggy",
                transactionType: TransactionType.EXPENSE,
            }),
        ).rejects.toThrow("AI returned an invalid category.");

        expect(upsertMock).not.toHaveBeenCalled();
    });

    it("returns the AI categorization result", async () => {
        const result = await categorizeMerchant({
            userId: "user-1",
            merchantName: "Swiggy",
            transactionType: TransactionType.EXPENSE,
        });

        expect(result).toEqual({
            category: expenseCategory,
            confidence: 0.91,
            reasoning: "Food delivery",
            fromCache: false,
        });
    });

    it("persists the merchant mapping", async () => {
        await categorizeMerchant({
            userId: "user-1",
            merchantName: "Swiggy",
            transactionType: TransactionType.EXPENSE,
        });

        expect(upsertMock).toHaveBeenCalledTimes(1);

        expect(upsertMock).toHaveBeenCalledWith({
            userId: "user-1",
            merchant: "Swiggy",
            normalizedName: "swiggy",
            categoryId: "food",
            source: MerchantMappingSource.AI,
            confidence: 0.91,
        });
    });

    it("passes the normalized merchant name to the cache lookup", async () => {
        await categorizeMerchant({
            userId: "user-1",
            merchantName: "Swiggy",
            transactionType: TransactionType.EXPENSE,
        });

        expect(findUniqueMock).toHaveBeenCalledWith({
            where: {
                userId_normalizedName: {
                    userId: "user-1",
                    normalizedName: "swiggy",
                },
            },
            include: {
                category: true,
            },
        });
    });

    it("calls normalizeMerchantName once", async () => {
        await categorizeMerchant({
            userId: "user-1",
            merchantName: "Swiggy",
            transactionType: TransactionType.EXPENSE,
        });

        expect(normalizeMock).toHaveBeenCalledTimes(1);
        expect(normalizeMock).toHaveBeenCalledWith("Swiggy");
    });

    it("loads the category tree with the correct arguments", async () => {
        await categorizeMerchant({
            userId: "user-1",
            merchantName: "Swiggy",
            transactionType: TransactionType.EXPENSE,
        });

        expect(treeMock).toHaveBeenCalledWith(
            "user-1",
            TransactionType.EXPENSE,
        );
    });

    it("calls AI with the merchant, transaction type and category tree", async () => {
        const tree = [
            {
                id: "food",
                name: "Food",
                type: TransactionType.EXPENSE,
                children: [],
            },
        ];

        treeMock.mockResolvedValue(tree);

        await categorizeMerchant({
            userId: "user-1",
            merchantName: "Swiggy",
            transactionType: TransactionType.EXPENSE,
        });

        expect(aiMock).toHaveBeenCalledWith(
            "Swiggy",
            TransactionType.EXPENSE,
            tree,
        );
    });

    it("looks up the AI-selected category", async () => {
        await categorizeMerchant({
            userId: "user-1",
            merchantName: "Swiggy",
            transactionType: TransactionType.EXPENSE,
        });

        expect(categoryMock).toHaveBeenCalledWith(
            "user-1",
            "food",
        );
    });

    it("returns the AI confidence unchanged", async () => {
        aiMock.mockResolvedValue({
            categoryId: "food",
            confidence: 0.37,
            reasoning: "Matched merchant",
        });

        const result = await categorizeMerchant({
            userId: "user-1",
            merchantName: "Swiggy",
            transactionType: TransactionType.EXPENSE,
        });

        expect(result.confidence).toBe(0.37);
    });

    it("returns the AI reasoning unchanged", async () => {
        aiMock.mockResolvedValue({
            categoryId: "food",
            confidence: 0.8,
            reasoning: "Known food delivery merchant",
        });

        const result = await categorizeMerchant({
            userId: "user-1",
            merchantName: "Swiggy",
            transactionType: TransactionType.EXPENSE,
        });

        expect(result.reasoning).toBe(
            "Known food delivery merchant",
        );
    });
});