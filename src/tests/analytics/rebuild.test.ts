import {describe, expect, it} from "vitest";
import {TransactionType} from "@prisma/client";

import {prisma} from "../../database/prisma";
import {createTransaction} from "../../modules/transactions/transaction.service";
import {createTestContext} from "../helpers/context";
import {rebuildMonth, rebuildYear} from "../../modules/analytics/analytics.rebuilder";

describe("Analytics Rebuild", () => {
    describe("rebuildMonth", () => {
        it("rebuilds analytics from transactions", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.INCOME,
                amount: 10000,
                date: "2026-08-10T10:00:00.000Z",
                merchant: "Salary",
                categoryId: ctx.categories.salary.id,
                destinationAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 3000,
                date: "2026-08-15T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.TRANSFER,
                amount: 2000,
                date: "2026-08-20T10:00:00.000Z",
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId: ctx.accounts.secondBank.id,
            });

            await prisma.monthlyAnalytics.delete({
                where: {
                    userId_year_month: {
                        userId: ctx.user.id,
                        year: 2026,
                        month: 8,
                    },
                },
            });

            await rebuildMonth(
                ctx.user.id,
                2026,
                8,
            );

            const analytics =
                await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

            expect(analytics).not.toBeNull();

            expect(Number(analytics!.totalIncome))
                .toBe(10000);

            expect(Number(analytics!.totalExpense))
                .toBe(3000);

            expect(Number(analytics!.totalInvestment))
                .toBe(0);

            expect(Number(analytics!.totalTransfer))
                .toBe(2000);
        });

        it("does not include deleted transactions", async () => {
            const ctx = await createTestContext();

            const transaction = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.EXPENSE,
                    amount: 5000,
                    date: "2026-08-10T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                },
            );

            await prisma.transaction.update({
                where: {
                    id: transaction.id,
                },
                data: {
                    deletedAt: new Date(),
                },
            });

            await rebuildMonth(
                ctx.user.id,
                2026,
                8,
            );

            const analytics =
                await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

            expect(Number(analytics!.totalExpense))
                .toBe(0);
        });
        it("produces the same result when rebuilt multiple times", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 2500,
                date: "2026-08-10T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            await rebuildMonth(
                ctx.user.id,
                2026,
                8,
            );

            await rebuildMonth(
                ctx.user.id,
                2026,
                8,
            );

            const analytics =
                await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

            expect(Number(analytics!.totalExpense))
                .toBe(2500);
        });

        it("creates zero analytics for an empty month", async () => {
            const ctx = await createTestContext();

            await rebuildMonth(
                ctx.user.id,
                2026,
                11,
            );

            const analytics =
                await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 11,
                        },
                    },
                });

            expect(analytics).not.toBeNull();

            expect(Number(analytics!.totalIncome))
                .toBe(0);

            expect(Number(analytics!.totalExpense))
                .toBe(0);

            expect(Number(analytics!.totalInvestment))
                .toBe(0);

            expect(Number(analytics!.totalTransfer))
                .toBe(0);
        });
    });

    describe("rebuildYear", () => {
        it("rebuilds all twelve months", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 1000,
                date: "2026-01-10T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.INCOME,
                amount: 5000,
                date: "2026-06-10T10:00:00.000Z",
                merchant: "Salary",
                categoryId: ctx.categories.salary.id,
                destinationAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.TRANSFER,
                amount: 2000,
                date: "2026-12-10T10:00:00.000Z",
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId: ctx.accounts.secondBank.id,
            });

            await rebuildYear(
                ctx.user.id,
                2026,
            );

            const analytics =
                await prisma.monthlyAnalytics.findMany({
                    where: {
                        userId: ctx.user.id,
                        year: 2026,
                    },
                    orderBy: {
                        month: "asc",
                    },
                });

            expect(analytics).toHaveLength(12);

            expect(Number(analytics[0].totalExpense))
                .toBe(1000);

            expect(Number(analytics[5].totalIncome))
                .toBe(5000);

            expect(Number(analytics[11].totalTransfer))
                .toBe(2000);
        }, 15000);

        it("sums multiple transactions of the same type", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 1000,
                date: "2026-08-05T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 2500,
                date: "2026-08-10T10:00:00.000Z",
                merchant: "Swiggy",
                categoryId: ctx.categories.food.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 750,
                date: "2026-08-20T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            await rebuildMonth(ctx.user.id, 2026, 8);

            const analytics =
                await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

            expect(Number(analytics!.totalExpense)).toBe(4250);
        });
        it("sums multiple transfers", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.TRANSFER,
                amount: 1000,
                date: "2026-08-05T10:00:00.000Z",
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId: ctx.accounts.secondBank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.TRANSFER,
                amount: 3000,
                date: "2026-08-15T10:00:00.000Z",
                sourceAccountId: ctx.accounts.secondBank.id,
                destinationAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.TRANSFER,
                amount: 2500,
                date: "2026-08-25T10:00:00.000Z",
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId: ctx.accounts.secondBank.id,
            });

            await rebuildMonth(ctx.user.id, 2026, 8);

            const analytics =
                await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

            expect(Number(analytics!.totalTransfer)).toBe(6500);
        });
        it("aggregates each transaction type independently", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.INCOME,
                amount: 15000,
                date: "2026-08-05T10:00:00.000Z",
                merchant: "Salary",
                categoryId: ctx.categories.salary.id,
                destinationAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.INCOME,
                amount: 5000,
                date: "2026-08-06T10:00:00.000Z",
                merchant: "Salary",
                categoryId: ctx.categories.salary.id,
                destinationAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 2000,
                date: "2026-08-10T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.INVESTMENT,
                amount: 3000,
                date: "2026-08-15T10:00:00.000Z",
                merchant: "Mutual Fund",
                categoryId: ctx.categories.investment.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.TRANSFER,
                amount: 4000,
                date: "2026-08-20T10:00:00.000Z",
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId: ctx.accounts.secondBank.id,
            });

            await rebuildMonth(ctx.user.id, 2026, 8);

            const analytics =
                await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

            expect(Number(analytics!.totalIncome)).toBe(20000);
            expect(Number(analytics!.totalExpense)).toBe(2000);
            expect(Number(analytics!.totalInvestment)).toBe(3000);
            expect(Number(analytics!.totalTransfer)).toBe(4000);
        }, 15000);
    });
});