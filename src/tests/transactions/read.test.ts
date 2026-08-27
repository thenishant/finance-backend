import {describe, expect, it} from "vitest";
import {TransactionType} from "@prisma/client";

import {prisma} from "../../database/prisma";

import {createTestContext} from "../helpers/context";
import {
    getRecentTransactions,
    getTransactionById,
    getTransactions
} from "../../modules/transactions/transaction.service";

describe("Transaction Reads", () => {
    describe("getTransactions", () => {
        it("returns active transactions for the user", async () => {
            const ctx = await createTestContext();

            await prisma.transaction.create({
                data: {
                    userId: ctx.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 100,
                    date: new Date("2026-08-20T10:00:00.000Z"),
                    year: 2026,
                    month: 8,
                    merchantId: ctx.merchants.amazon.id,
                    merchantRaw: "Amazon",
                    merchantNormalized: "amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                    categoryAssignmentSource: "USER",
                },
            });

            const transactions = await getTransactions(
                ctx.user.id,
            );

            expect(
                transactions.some(
                    transaction => Number(transaction.amount) === 100,
                ),
            ).toBe(true);
        });

        it("does not return deleted transactions", async () => {
            const ctx = await createTestContext();

            const transaction = await prisma.transaction.create({
                data: {
                    userId: ctx.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 100,
                    date: new Date("2026-08-20T10:00:00.000Z"),
                    year: 2026,
                    month: 8,
                    merchantId: ctx.merchants.amazon.id,
                    merchantRaw: "Amazon",
                    merchantNormalized: "amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                    categoryAssignmentSource: "USER",
                    deletedAt: new Date(),
                },
            });

            const transactions = await getTransactions(
                ctx.user.id,
            );

            expect(
                transactions.some(
                    item => item.id === transaction.id,
                ),
            ).toBe(false);
        });

        it("does not return another user's transactions", async () => {
            const ctx = await createTestContext();
            const other = await createTestContext();

            const transaction = await prisma.transaction.create({
                data: {
                    userId: other.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 999,
                    date: new Date("2026-08-20T10:00:00.000Z"),
                    year: 2026,
                    month: 8,
                    merchantId: other.merchants.amazon.id,
                    merchantRaw: "Amazon",
                    merchantNormalized: "amazon",
                    categoryId: other.categories.shopping.id,
                    sourceAccountId: other.accounts.bank.id,
                    categoryAssignmentSource: "USER",
                },
            });

            const transactions = await getTransactions(
                ctx.user.id,
            );

            expect(
                transactions.some(
                    item => item.id === transaction.id,
                ),
            ).toBe(false);
        });

        it("sorts transactions by date descending by default", async () => {
            const ctx = await createTestContext();

            const older = await prisma.transaction.create({
                data: {
                    userId: ctx.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 100,
                    date: new Date("2026-08-01T10:00:00.000Z"),
                    year: 2026,
                    month: 8,
                    merchantId: ctx.merchants.amazon.id,
                    merchantRaw: "Amazon",
                    merchantNormalized: "amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                    categoryAssignmentSource: "USER",
                },
            });

            const newer = await prisma.transaction.create({
                data: {
                    userId: ctx.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 200,
                    date: new Date("2026-08-25T10:00:00.000Z"),
                    year: 2026,
                    month: 8,
                    merchantId: ctx.merchants.swiggy.id,
                    merchantRaw: "Swiggy",
                    merchantNormalized: "swiggy",
                    categoryId: ctx.categories.food.id,
                    sourceAccountId: ctx.accounts.bank.id,
                    categoryAssignmentSource: "USER",
                },
            });

            const transactions = await getTransactions(
                ctx.user.id,
                "date",
                "desc",
            );

            const olderIndex = transactions.findIndex(
                item => item.id === older.id,
            );

            const newerIndex = transactions.findIndex(
                item => item.id === newer.id,
            );

            expect(newerIndex).toBeLessThan(olderIndex);
        });

        it("sorts transactions by date ascending", async () => {
            const ctx = await createTestContext();

            const older = await prisma.transaction.create({
                data: {
                    userId: ctx.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 100,
                    date: new Date("2026-08-01T10:00:00.000Z"),
                    year: 2026,
                    month: 8,
                    merchantId: ctx.merchants.amazon.id,
                    merchantRaw: "Amazon",
                    merchantNormalized: "amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                    categoryAssignmentSource: "USER",
                },
            });

            const newer = await prisma.transaction.create({
                data: {
                    userId: ctx.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 200,
                    date: new Date("2026-08-25T10:00:00.000Z"),
                    year: 2026,
                    month: 8,
                    merchantId: ctx.merchants.swiggy.id,
                    merchantRaw: "Swiggy",
                    merchantNormalized: "swiggy",
                    categoryId: ctx.categories.food.id,
                    sourceAccountId: ctx.accounts.bank.id,
                    categoryAssignmentSource: "USER",
                },
            });

            const transactions = await getTransactions(
                ctx.user.id,
                "date",
                "asc",
            );

            const olderIndex = transactions.findIndex(
                item => item.id === older.id,
            );

            const newerIndex = transactions.findIndex(
                item => item.id === newer.id,
            );

            expect(olderIndex).toBeLessThan(newerIndex);
        });
    });

    describe("getRecentTransactions", () => {
        it("respects the requested limit", async () => {
            const ctx = await createTestContext();

            for (let i = 0; i < 3; i++) {
                await prisma.transaction.create({
                    data: {
                        userId: ctx.user.id,
                        type: TransactionType.EXPENSE,
                        amount: 100 + i,
                        date: new Date(
                            `2026-08-${String(10 + i).padStart(2, "0")}T10:00:00.000Z`,
                        ),
                        year: 2026,
                        month: 8,
                        merchantId: ctx.merchants.amazon.id,
                        merchantRaw: "Amazon",
                        merchantNormalized: "amazon",
                        categoryId: ctx.categories.shopping.id,
                        sourceAccountId: ctx.accounts.bank.id,
                        categoryAssignmentSource: "USER",
                    },
                });
            }

            const transactions =
                await getRecentTransactions(
                    ctx.user.id,
                    2,
                );

            expect(transactions).toHaveLength(2);
        });

        it("returns the most recent transactions first", async () => {
            const ctx = await createTestContext();

            const oldest = await prisma.transaction.create({
                data: {
                    userId: ctx.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 100,
                    date: new Date("2026-08-01T10:00:00.000Z"),
                    year: 2026,
                    month: 8,
                    merchantId: ctx.merchants.amazon.id,
                    merchantRaw: "Amazon",
                    merchantNormalized: "amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                    categoryAssignmentSource: "USER",
                },
            });

            const newest = await prisma.transaction.create({
                data: {
                    userId: ctx.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 300,
                    date: new Date("2026-08-25T10:00:00.000Z"),
                    year: 2026,
                    month: 8,
                    merchantId: ctx.merchants.swiggy.id,
                    merchantRaw: "Swiggy",
                    merchantNormalized: "swiggy",
                    categoryId: ctx.categories.food.id,
                    sourceAccountId: ctx.accounts.bank.id,
                    categoryAssignmentSource: "USER",
                },
            });

            const transactions =
                await getRecentTransactions(
                    ctx.user.id,
                    1,
                );

            expect(transactions).toHaveLength(1);
            expect(transactions[0].id).toBe(newest.id);
            expect(transactions[0].id).not.toBe(oldest.id);
        });

        it("does not return deleted transactions", async () => {
            const ctx = await createTestContext();

            const deleted = await prisma.transaction.create({
                data: {
                    userId: ctx.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 500,
                    date: new Date("2026-08-25T10:00:00.000Z"),
                    year: 2026,
                    month: 8,
                    merchantId: ctx.merchants.amazon.id,
                    merchantRaw: "Amazon",
                    merchantNormalized: "amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                    categoryAssignmentSource: "USER",
                    deletedAt: new Date(),
                },
            });

            const transactions =
                await getRecentTransactions(
                    ctx.user.id,
                    10,
                );

            expect(
                transactions.some(
                    item => item.id === deleted.id,
                ),
            ).toBe(false);
        });
    });

    describe("getTransactionById", () => {
        it("returns an active transaction", async () => {
            const ctx = await createTestContext();

            const transaction = await prisma.transaction.create({
                data: {
                    userId: ctx.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 250,
                    date: new Date("2026-08-25T10:00:00.000Z"),
                    year: 2026,
                    month: 8,
                    merchantId: ctx.merchants.amazon.id,
                    merchantRaw: "Amazon",
                    merchantNormalized: "amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                    categoryAssignmentSource: "USER",
                },
            });

            const result = await getTransactionById(
                ctx.user.id,
                transaction.id,
            );

            expect(result.id).toBe(transaction.id);
            expect(Number(result.amount)).toBe(250);
        });

        it("throws when the transaction does not exist", async () => {
            const ctx = await createTestContext();

            await expect(
                getTransactionById(
                    ctx.user.id,
                    "00000000-0000-0000-0000-000000000000",
                ),
            ).rejects.toThrow("Transaction not found");
        });

        it("does not return another user's transaction", async () => {
            const ctx = await createTestContext();
            const other = await createTestContext();

            const transaction = await prisma.transaction.create({
                data: {
                    userId: other.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 999,
                    date: new Date("2026-08-25T10:00:00.000Z"),
                    year: 2026,
                    month: 8,
                    merchantId: other.merchants.amazon.id,
                    merchantRaw: "Amazon",
                    merchantNormalized: "amazon",
                    categoryId: other.categories.shopping.id,
                    sourceAccountId: other.accounts.bank.id,
                    categoryAssignmentSource: "USER",
                },
            });

            await expect(
                getTransactionById(
                    ctx.user.id,
                    transaction.id,
                ),
            ).rejects.toThrow("Transaction not found");
        });

        it("does not return a deleted transaction", async () => {
            const ctx = await createTestContext();

            const transaction = await prisma.transaction.create({
                data: {
                    userId: ctx.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 250,
                    date: new Date("2026-08-25T10:00:00.000Z"),
                    year: 2026,
                    month: 8,
                    merchantId: ctx.merchants.amazon.id,
                    merchantRaw: "Amazon",
                    merchantNormalized: "amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                    categoryAssignmentSource: "USER",
                    deletedAt: new Date(),
                },
            });

            await expect(
                getTransactionById(
                    ctx.user.id,
                    transaction.id,
                ),
            ).rejects.toThrow("Transaction not found");
        });
    });
});