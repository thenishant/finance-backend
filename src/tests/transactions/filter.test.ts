import {describe, expect, it} from "vitest";
import {TransactionType} from "@prisma/client";

import {prisma} from "../../database/prisma";
import {createTransaction, getTransactions} from "../../modules/transactions/transaction.service";

import {createTestContext} from "../helpers/context";

describe("Read Transactions", () => {
    describe("filter combinations", () => {
        it("filters by transaction type", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.INCOME,
                amount: 5000,
                date: "2026-08-26T10:00:00.000Z",
                merchant: "Salary",
                categoryId: ctx.categories.salary.id,
                destinationAccountId: ctx.accounts.bank.id,
            });

            const transactions = await getTransactions(
                ctx.user.id,
                "date",
                "desc",
                // Only if your current getTransactions API supports filters.
            );
        });
    });

    describe("getTransactions", () => {
        it("returns the user's active transactions", async () => {
            const ctx = await createTestContext();

            const transaction = await prisma.transaction.create({
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
                },
            });

            const transactions = await getTransactions(ctx.user.id);

            expect(
                transactions.some(item => item.id === transaction.id),
            ).toBe(true);
        });

        it("does not return deleted transactions", async () => {
            const ctx = await createTestContext();

            const activeTransaction = await prisma.transaction.create({
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
                },
            });

            const deletedTransaction = await prisma.transaction.create({
                data: {
                    userId: ctx.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 1000,
                    date: new Date("2026-08-24T10:00:00.000Z"),
                    year: 2026,
                    month: 8,
                    merchantId: ctx.merchants.swiggy.id,
                    merchantRaw: "Swiggy",
                    merchantNormalized: "swiggy",
                    categoryId: ctx.categories.food.id,
                    sourceAccountId: ctx.accounts.bank.id,
                    categoryAssignmentSource: "USER",
                    deletedAt: new Date(),
                },
            });

            const transactions = await getTransactions(ctx.user.id);

            expect(
                transactions.some(item => item.id === activeTransaction.id),
            ).toBe(true);

            expect(
                transactions.some(item => item.id === deletedTransaction.id),
            ).toBe(false);
        });

        it("does not return another user's transactions", async () => {
            const ctx = await createTestContext();
            const other = await createTestContext();

            const otherTransaction = await prisma.transaction.create({
                data: {
                    userId: other.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 9999,
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

            const transactions = await getTransactions(ctx.user.id);

            expect(
                transactions.some(item => item.id === otherTransaction.id),
            ).toBe(false);
        });

        it("sorts transactions by date descending by default", async () => {
            const ctx = await createTestContext();

            const older = await prisma.transaction.create({
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

            const transactions = await getTransactions(ctx.user.id);

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

        it("sorts transactions by amount descending", async () => {
            const ctx = await createTestContext();

            const smaller = await prisma.transaction.create({
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

            const larger = await prisma.transaction.create({
                data: {
                    userId: ctx.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 5000,
                    date: new Date("2026-08-21T10:00:00.000Z"),
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
                "amount",
                "desc",
            );

            const smallerIndex = transactions.findIndex(
                item => item.id === smaller.id,
            );

            const largerIndex = transactions.findIndex(
                item => item.id === larger.id,
            );

            expect(largerIndex).toBeLessThan(smallerIndex);
        });

        it("sorts transactions by amount ascending", async () => {
            const ctx = await createTestContext();

            const smaller = await prisma.transaction.create({
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

            const larger = await prisma.transaction.create({
                data: {
                    userId: ctx.user.id,
                    type: TransactionType.EXPENSE,
                    amount: 5000,
                    date: new Date("2026-08-21T10:00:00.000Z"),
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
                "amount",
                "asc",
            );

            const smallerIndex = transactions.findIndex(
                item => item.id === smaller.id,
            );

            const largerIndex = transactions.findIndex(
                item => item.id === larger.id,
            );

            expect(smallerIndex).toBeLessThan(largerIndex);
        });
    });
});