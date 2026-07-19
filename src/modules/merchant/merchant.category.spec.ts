import {beforeEach, describe, expect, it, vi} from "vitest";
import {TransactionType} from "@prisma/client";
import {prisma} from "../../database/prisma";
import {getCategoryById, getMerchantCategoryTree,} from "./merchant.category";

vi.mock("../../database/prisma", () => ({
    prisma: {
        category: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
        },
    },
}));

const findManyMock = vi.mocked(prisma.category.findMany);
const findFirstMock = vi.mocked(prisma.category.findFirst);

const createCategory = (
    overrides: Partial<any> = {},
) => ({
    id: "id",
    userId: "user-1",
    parentId: null,
    name: "Category",
    type: TransactionType.EXPENSE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});

describe("merchant.category", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getMerchantCategoryTree", () => {
        it("returns an empty tree when there are no categories", async () => {
            findManyMock.mockResolvedValue([]);

            const result = await getMerchantCategoryTree(
                "user-1",
                TransactionType.EXPENSE,
            );

            expect(result).toEqual([]);
        });

        it("queries categories for the user and transaction type", async () => {
            findManyMock.mockResolvedValue([]);

            await getMerchantCategoryTree(
                "user-1",
                TransactionType.EXPENSE,
            );

            expect(findManyMock).toHaveBeenCalledWith({
                where: {
                    userId: "user-1",
                    type: TransactionType.EXPENSE,
                },
                orderBy: {
                    name: "asc",
                },
            });
        });

        it("builds a parent-child tree", async () => {
            findManyMock.mockResolvedValue([
                createCategory({
                    id: "food",
                    name: "Food",
                }),
                createCategory({
                    id: "restaurants",
                    parentId: "food",
                    name: "Restaurants",
                }),
                createCategory({
                    id: "delivery",
                    parentId: "food",
                    name: "Delivery",
                }),
            ]);

            const result = await getMerchantCategoryTree(
                "user-1",
                TransactionType.EXPENSE,
            );

            expect(result).toEqual([
                {
                    id: "food",
                    name: "Food",
                    type: TransactionType.EXPENSE,
                    children: [
                        {
                            id: "delivery",
                            name: "Delivery",
                            type: TransactionType.EXPENSE,
                            children: [],
                        },
                        {
                            id: "restaurants",
                            name: "Restaurants",
                            type: TransactionType.EXPENSE,
                            children: [],
                        },
                    ],
                },
            ]);
        });

        it("sorts root categories alphabetically", async () => {
            findManyMock.mockResolvedValue([
                createCategory({
                    id: "z",
                    name: "Zebra",
                }),
                createCategory({
                    id: "a",
                    name: "Alpha",
                }),
                createCategory({
                    id: "m",
                    name: "Market",
                }),
            ]);

            const result = await getMerchantCategoryTree(
                "user-1",
                TransactionType.EXPENSE,
            );

            expect(result.map(c => c.name)).toEqual([
                "Alpha",
                "Market",
                "Zebra",
            ]);
        });

        it("sorts child categories alphabetically", async () => {
            findManyMock.mockResolvedValue([
                createCategory({
                    id: "food",
                    name: "Food",
                }),
                createCategory({
                    id: "c",
                    parentId: "food",
                    name: "Coffee",
                }),
                createCategory({
                    id: "a",
                    parentId: "food",
                    name: "Bakery",
                }),
                createCategory({
                    id: "b",
                    parentId: "food",
                    name: "Dining",
                }),
            ]);

            const result = await getMerchantCategoryTree(
                "user-1",
                TransactionType.EXPENSE,
            );

            expect(
                result[0].children.map(c => c.name),
            ).toEqual([
                "Bakery",
                "Coffee",
                "Dining",
            ]);
        });

        it("builds nested trees recursively", async () => {
            findManyMock.mockResolvedValue([
                createCategory({
                    id: "food",
                    name: "Food",
                }),
                createCategory({
                    id: "restaurants",
                    parentId: "food",
                    name: "Restaurants",
                }),
                createCategory({
                    id: "fast-food",
                    parentId: "restaurants",
                    name: "Fast Food",
                }),
            ]);

            const result = await getMerchantCategoryTree(
                "user-1",
                TransactionType.EXPENSE,
            );

            expect(result).toEqual([
                {
                    id: "food",
                    name: "Food",
                    type: TransactionType.EXPENSE,
                    children: [
                        {
                            id: "restaurants",
                            name: "Restaurants",
                            type: TransactionType.EXPENSE,
                            children: [
                                {
                                    id: "fast-food",
                                    name: "Fast Food",
                                    type: TransactionType.EXPENSE,
                                    children: [],
                                },
                            ],
                        },
                    ],
                },
            ]);
        });
    });

    describe("getCategoryById", () => {
        it("returns the category", async () => {
            const category = createCategory({
                id: "food",
                name: "Food",
            });

            findFirstMock.mockResolvedValue(category);

            const result = await getCategoryById(
                "user-1",
                "food",
            );

            expect(result).toEqual(category);
        });

        it("returns null when the category does not exist", async () => {
            findFirstMock.mockResolvedValue(null);

            const result = await getCategoryById(
                "user-1",
                "missing",
            );

            expect(result).toBeNull();
        });

        it("queries by user and category id", async () => {
            findFirstMock.mockResolvedValue(null);

            await getCategoryById(
                "user-1",
                "food",
            );

            expect(findFirstMock).toHaveBeenCalledWith({
                where: {
                    id: "food",
                    userId: "user-1",
                },
            });
        });
    });
});