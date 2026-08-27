import {prisma} from "../../database/prisma";
import {describe, expect, it} from "vitest";

import {TransactionType} from "@prisma/client";
import {createTransaction} from "../../modules/transactions/transaction.service";
import {createTestContext} from "../helpers/context";

describe("Analytics Read", () => {
    describe("monthly analytics", () => {
        it("returns the monthly analytics record", async () => {
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
                amount: 2500,
                date: "2026-08-15T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            const analytics = await prisma.monthlyAnalytics.findUnique({
                where: {
                    userId_year_month: {
                        userId: ctx.user.id,
                        year: 2026,
                        month: 8,
                    },
                },
            });

            expect(analytics).not.toBeNull();

            expect(Number(analytics!.totalIncome)).toBe(10000);
            expect(Number(analytics!.totalExpense)).toBe(2500);
            expect(Number(analytics!.totalInvestment)).toBe(0);
        }, 15000);

        it("returns zero for analytics categories with no transactions", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 1000,
                date: "2026-08-10T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            const analytics = await prisma.monthlyAnalytics.findUnique({
                where: {
                    userId_year_month: {
                        userId: ctx.user.id,
                        year: 2026,
                        month: 8,
                    },
                },
            });

            expect(Number(analytics!.totalExpense)).toBe(1000);
            expect(Number(analytics!.totalIncome)).toBe(0);
            expect(Number(analytics!.totalInvestment)).toBe(0);
        });

        it("returns separate records for each month", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 1000,
                date: "2026-08-10T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 2000,
                date: "2026-09-10T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            const analytics = await prisma.monthlyAnalytics.findMany({
                where: {
                    userId: ctx.user.id,
                },
                orderBy: [
                    {year: "asc"},
                    {month: "asc"},
                ],
            });

            expect(analytics).toHaveLength(2);

            expect(analytics[0].year).toBe(2026);
            expect(analytics[0].month).toBe(8);
            expect(Number(analytics[0].totalExpense)).toBe(1000);

            expect(analytics[1].year).toBe(2026);
            expect(analytics[1].month).toBe(9);
            expect(Number(analytics[1].totalExpense)).toBe(2000);
        });

        it("does not expose another user's analytics", async () => {
            const ctx1 = await createTestContext();
            const ctx2 = await createTestContext();

            await createTransaction(ctx1.user.id, {
                type: TransactionType.EXPENSE,
                amount: 1000,
                date: "2026-08-10T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx1.categories.shopping.id,
                sourceAccountId: ctx1.accounts.bank.id,
            });

            await createTransaction(ctx2.user.id, {
                type: TransactionType.EXPENSE,
                amount: 5000,
                date: "2026-08-10T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx2.categories.shopping.id,
                sourceAccountId: ctx2.accounts.bank.id,
            });

            const analytics = await prisma.monthlyAnalytics.findMany({
                where: {
                    userId: ctx1.user.id,
                },
            });

            expect(analytics).toHaveLength(1);
            expect(Number(analytics[0].totalExpense)).toBe(1000);
        }, 15000);

        it("records transfers in monthly analytics", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.TRANSFER,
                amount: 5000,
                date: "2026-08-10T10:00:00.000Z",
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId: ctx.accounts.secondBank.id,
            });

            const analytics = await prisma.monthlyAnalytics.findUnique({
                where: {
                    userId_year_month: {
                        userId: ctx.user.id,
                        year: 2026,
                        month: 8,
                    },
                },
            });

            expect(analytics).not.toBeNull();

            expect(Number(analytics!.totalTransfer)).toBe(5000);
            expect(Number(analytics!.totalIncome)).toBe(0);
            expect(Number(analytics!.totalExpense)).toBe(0);
            expect(Number(analytics!.totalInvestment)).toBe(0);
        });

        it("handles income, expense, investment and transfer in the same month", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.INCOME,
                amount: 15000,
                date: "2026-08-01T10:00:00.000Z",
                merchant: "Salary",
                categoryId: ctx.categories.salary.id,
                destinationAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 4000,
                date: "2026-08-15T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.INVESTMENT,
                amount: 3000,
                date: "2026-08-20T10:00:00.000Z",
                merchant: "Mutual Fund",
                categoryId: ctx.categories.investment.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.TRANSFER,
                amount: 2000,
                date: "2026-08-25T10:00:00.000Z",
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId: ctx.accounts.secondBank.id,
            });

            const analytics = await prisma.monthlyAnalytics.findUnique({
                where: {
                    userId_year_month: {
                        userId: ctx.user.id,
                        year: 2026,
                        month: 8,
                    },
                },
            });

            expect(analytics).not.toBeNull();

            expect(Number(analytics!.totalIncome)).toBe(15000);
            expect(Number(analytics!.totalExpense)).toBe(4000);
            expect(Number(analytics!.totalInvestment)).toBe(3000);
            expect(Number(analytics!.totalTransfer)).toBe(2000);
        }, 15000);

        it("does not mix the same month across different users", async () => {
            const ctx1 = await createTestContext();
            const ctx2 = await createTestContext();

            await createTransaction(ctx1.user.id, {
                type: TransactionType.INCOME,
                amount: 10000,
                date: "2026-08-10T10:00:00.000Z",
                merchant: "Salary",
                categoryId: ctx1.categories.salary.id,
                destinationAccountId: ctx1.accounts.bank.id,
            });

            await createTransaction(ctx2.user.id, {
                type: TransactionType.INCOME,
                amount: 20000,
                date: "2026-08-10T10:00:00.000Z",
                merchant: "Salary",
                categoryId: ctx2.categories.salary.id,
                destinationAccountId: ctx2.accounts.bank.id,
            });

            const analytics1 = await prisma.monthlyAnalytics.findUnique({
                where: {
                    userId_year_month: {
                        userId: ctx1.user.id,
                        year: 2026,
                        month: 8,
                    },
                },
            });

            const analytics2 = await prisma.monthlyAnalytics.findUnique({
                where: {
                    userId_year_month: {
                        userId: ctx2.user.id,
                        year: 2026,
                        month: 8,
                    },
                },
            });

            expect(Number(analytics1!.totalIncome)).toBe(10000);
            expect(Number(analytics2!.totalIncome)).toBe(20000);
        }, 15000);

        it("handles December to January as separate analytics records", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 1000,
                date: "2026-12-31T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 2000,
                date: "2027-01-01T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            });

            const december = await prisma.monthlyAnalytics.findUnique({
                where: {
                    userId_year_month: {
                        userId: ctx.user.id,
                        year: 2026,
                        month: 12,
                    },
                },
            });

            const january = await prisma.monthlyAnalytics.findUnique({
                where: {
                    userId_year_month: {
                        userId: ctx.user.id,
                        year: 2027,
                        month: 1,
                    },
                },
            });

            expect(Number(december!.totalExpense)).toBe(1000);
            expect(Number(january!.totalExpense)).toBe(2000);
        });
    });
});