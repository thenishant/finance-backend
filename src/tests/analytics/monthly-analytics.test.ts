import {describe, expect, it} from "vitest";
import {TransactionType} from "@prisma/client";
import {
    createTransaction,
    deleteTransaction,
    restoreTransaction,
    updateTransaction,
} from "../../modules/transactions/transaction.service";
import {createTestContext} from "../helpers/context";
import {prisma} from "../../database/prisma";

describe("Monthly Analytics", () => {
    describe("transaction creation", () => {
        it("creates expense analytics", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
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
            expect(Number(analytics!.totalExpense)).toBe(500);
            expect(Number(analytics!.totalIncome)).toBe(0);
            expect(Number(analytics!.totalInvestment)).toBe(0);
        });

        it("creates income analytics", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.INCOME,
                amount: 5000,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Salary",
                categoryId: ctx.categories.salary.id,
                destinationAccountId: ctx.accounts.bank.id,
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
            expect(Number(analytics!.totalIncome)).toBe(5000);
            expect(Number(analytics!.totalExpense)).toBe(0);
            expect(Number(analytics!.totalInvestment)).toBe(0);
        });

        it("creates investment analytics", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.INVESTMENT,
                amount: 2000,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Mutual Fund",
                categoryId: ctx.categories.investment.id,
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
            expect(Number(analytics!.totalInvestment)).toBe(2000);
            expect(Number(analytics!.totalIncome)).toBe(0);
            expect(Number(analytics!.totalExpense)).toBe(0);
        });

        it("does not affect analytics for a transfer", async () => {
            const ctx = await createTestContext();

            await createTransaction(ctx.user.id, {
                type: TransactionType.TRANSFER,
                amount: 1000,
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
            expect(Number(analytics!.totalIncome)).toBe(0);
            expect(Number(analytics!.totalExpense)).toBe(0);
            expect(Number(analytics!.totalInvestment)).toBe(0);
        });
    });

    describe("Monthly Analytics", () => {
        describe("aggregation", () => {
            it("updates analytics when a transaction amount changes", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 1000,
                    date: "2026-08-10T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                let analytics = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                expect(Number(analytics!.totalExpense)).toBe(1000);

                await updateTransaction(
                    ctx.user.id,
                    transaction.id,
                    {
                        amount: 2500,
                    },
                );

                analytics = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                expect(Number(analytics!.totalExpense)).toBe(2500);
            });

            it("moves analytics when a transaction moves to another month", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 1000,
                    date: "2026-08-15T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await updateTransaction(
                    ctx.user.id,
                    transaction.id,
                    {
                        date: "2026-09-15T10:00:00.000Z",
                    },
                );

                const august = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                const september = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 9,
                        },
                    },
                });

                expect(Number(august!.totalExpense)).toBe(0);
                expect(Number(september!.totalExpense)).toBe(1000);
            });

            it("removes a deleted transaction from analytics", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 1500,
                    date: "2026-08-10T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await deleteTransaction(
                    ctx.user.id,
                    transaction.id,
                );

                const analytics = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                expect(Number(analytics!.totalExpense)).toBe(0);
            });

            it("restores a transaction into analytics", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 1500,
                    date: "2026-08-10T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await deleteTransaction(
                    ctx.user.id,
                    transaction.id,
                );

                await restoreTransaction(
                    ctx.user.id,
                    transaction.id,
                );

                const analytics = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                expect(Number(analytics!.totalExpense)).toBe(1500);
            });

            it("updates transfer analytics when the amount changes", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.TRANSFER,
                    amount: 5000,
                    date: "2026-08-10T10:00:00.000Z",
                    sourceAccountId: ctx.accounts.bank.id,
                    destinationAccountId: ctx.accounts.secondBank.id,
                });

                await updateTransaction(
                    ctx.user.id,
                    transaction.id,
                    {
                        amount: 7500,
                    },
                );

                const analytics = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                expect(Number(analytics!.totalTransfer)).toBe(7500);
                expect(Number(analytics!.totalIncome)).toBe(0);
                expect(Number(analytics!.totalExpense)).toBe(0);
                expect(Number(analytics!.totalInvestment)).toBe(0);
            });

            it("aggregates multiple expenses in the same month", async () => {
                const ctx = await createTestContext();

                await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 500,
                    date: "2026-08-05T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 300,
                    date: "2026-08-15T10:00:00.000Z",
                    merchant: "Swiggy",
                    categoryId: ctx.categories.food.id,
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

                expect(Number(analytics!.totalExpense)).toBe(800);
            });

            it("aggregates income, expense and investment independently", async () => {
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
                    date: "2026-08-11T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await createTransaction(ctx.user.id, {
                    type: TransactionType.INVESTMENT,
                    amount: 3000,
                    date: "2026-08-12T10:00:00.000Z",
                    merchant: "Mutual Fund",
                    categoryId: ctx.categories.investment.id,
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

                expect(Number(analytics!.totalIncome)).toBe(10000);
                expect(Number(analytics!.totalExpense)).toBe(2500);
                expect(Number(analytics!.totalInvestment)).toBe(3000);
            });

            it("keeps separate analytics records for different months", async () => {
                const ctx = await createTestContext();

                await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 500,
                    date: "2026-08-31T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 700,
                    date: "2026-09-01T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                const august = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                const september = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 9,
                        },
                    },
                });

                expect(Number(august!.totalExpense)).toBe(500);
                expect(Number(september!.totalExpense)).toBe(700);
            });
        });

        describe("transaction updates", () => {
            it("moves analytics from expense to income when transaction type changes", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 2000,
                    date: "2026-08-10T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await updateTransaction(
                    ctx.user.id,
                    transaction.id,
                    {
                        type: TransactionType.INCOME,
                        categoryId: ctx.categories.salary.id,
                        destinationAccountId: ctx.accounts.bank.id,
                    },
                );

                const analytics = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                expect(Number(analytics!.totalExpense)).toBe(0);
                expect(Number(analytics!.totalIncome)).toBe(2000);
                expect(Number(analytics!.totalInvestment)).toBe(0);
                expect(Number(analytics!.totalTransfer)).toBe(0);
            });

            it("moves analytics from expense to investment when transaction type changes", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 3000,
                    date: "2026-08-10T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await updateTransaction(
                    ctx.user.id,
                    transaction.id,
                    {
                        type: TransactionType.INVESTMENT,
                        categoryId: ctx.categories.investment.id,
                        sourceAccountId: ctx.accounts.bank.id,
                    },
                );

                const analytics = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                expect(Number(analytics!.totalExpense)).toBe(0);
                expect(Number(analytics!.totalIncome)).toBe(0);
                expect(Number(analytics!.totalInvestment)).toBe(3000);
                expect(Number(analytics!.totalTransfer)).toBe(0);
            });
            it("moves analytics from expense to transfer when transaction type changes", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 4000,
                    date: "2026-08-10T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await updateTransaction(
                    ctx.user.id,
                    transaction.id,
                    {
                        type: TransactionType.TRANSFER,
                        sourceAccountId: ctx.accounts.bank.id,
                        destinationAccountId: ctx.accounts.secondBank.id,
                    },
                );

                const analytics = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                expect(Number(analytics!.totalExpense)).toBe(0);
                expect(Number(analytics!.totalIncome)).toBe(0);
                expect(Number(analytics!.totalInvestment)).toBe(0);
                expect(Number(analytics!.totalTransfer)).toBe(4000);
            });
            it("moves analytics from transfer to expense when transaction type changes", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.TRANSFER,
                    amount: 5000,
                    date: "2026-08-10T10:00:00.000Z",
                    sourceAccountId: ctx.accounts.bank.id,
                    destinationAccountId: ctx.accounts.secondBank.id,
                });

                await updateTransaction(
                    ctx.user.id,
                    transaction.id,
                    {
                        type: TransactionType.EXPENSE,
                        merchant: "Amazon",
                        categoryId: ctx.categories.shopping.id,
                        sourceAccountId: ctx.accounts.bank.id,
                    },
                );

                const analytics = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                expect(Number(analytics!.totalTransfer)).toBe(0);
                expect(Number(analytics!.totalExpense)).toBe(5000);
            });
            it("rebuilds both months when type and date change together", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 6000,
                    date: "2026-08-20T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await updateTransaction(
                    ctx.user.id,
                    transaction.id,
                    {
                        type: TransactionType.INCOME,
                        amount: 7000,
                        date: "2026-09-20T10:00:00.000Z",
                        categoryId: ctx.categories.salary.id,
                        destinationAccountId: ctx.accounts.bank.id,
                    },
                );

                const august = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                const september = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 9,
                        },
                    },
                });

                expect(Number(august!.totalExpense)).toBe(0);
                expect(Number(august!.totalIncome)).toBe(0);

                expect(Number(september!.totalIncome)).toBe(7000);
                expect(Number(september!.totalExpense)).toBe(0);
            });

            it("updates analytics when an expense amount changes", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 500,
                    date: "2026-08-20T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await updateTransaction(ctx.user.id, transaction.id, {
                    amount: 800,
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

                expect(Number(analytics!.totalExpense)).toBe(800);
            });

            it("updates analytics when an income amount changes", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.INCOME,
                    amount: 5000,
                    date: "2026-08-20T10:00:00.000Z",
                    merchant: "Salary",
                    categoryId: ctx.categories.salary.id,
                    destinationAccountId: ctx.accounts.bank.id,
                });

                await updateTransaction(ctx.user.id, transaction.id, {
                    amount: 7500,
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

                expect(Number(analytics!.totalIncome)).toBe(7500);
            });

            it("moves analytics between months when transaction date changes", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 1000,
                    date: "2026-08-20T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await updateTransaction(ctx.user.id, transaction.id, {
                    date: "2026-09-20T10:00:00.000Z",
                });

                const august = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                const september = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 9,
                        },
                    },
                });

                expect(Number(august?.totalExpense ?? 0)).toBe(0);
                expect(Number(september!.totalExpense)).toBe(1000);
            });
        });

        describe("delete and restore", () => {
            it("removes an expense from analytics when deleted", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 1000,
                    date: "2026-08-20T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await deleteTransaction(ctx.user.id, transaction.id);

                const analytics = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                expect(Number(analytics?.totalExpense ?? 0)).toBe(0);
            });

            it("removes income from analytics when deleted", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.INCOME,
                    amount: 5000,
                    date: "2026-08-20T10:00:00.000Z",
                    merchant: "Salary",
                    categoryId: ctx.categories.salary.id,
                    destinationAccountId: ctx.accounts.bank.id,
                });

                await deleteTransaction(ctx.user.id, transaction.id);

                const analytics = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                expect(Number(analytics?.totalIncome ?? 0)).toBe(0);
            });

            it("restores an expense into analytics", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 1200,
                    date: "2026-08-20T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await deleteTransaction(ctx.user.id, transaction.id);

                await restoreTransaction(ctx.user.id, transaction.id);

                const analytics = await prisma.monthlyAnalytics.findUnique({
                    where: {
                        userId_year_month: {
                            userId: ctx.user.id,
                            year: 2026,
                            month: 8,
                        },
                    },
                });

                expect(Number(analytics!.totalExpense)).toBe(1200);
            });

            it("does not create duplicate analytics when deleting and restoring repeatedly", async () => {
                const ctx = await createTestContext();

                const transaction = await createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 1200,
                    date: "2026-08-20T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                });

                await deleteTransaction(ctx.user.id, transaction.id);
                await restoreTransaction(ctx.user.id, transaction.id);

                const analytics = await prisma.monthlyAnalytics.findMany({
                    where: {
                        userId: ctx.user.id,
                        year: 2026,
                        month: 8,
                    },
                });

                expect(analytics).toHaveLength(1);
                expect(Number(analytics[0].totalExpense)).toBe(1200);
            });
        });

        describe("user isolation", () => {
            it("does not mix analytics between users", async () => {
                const ctx1 = await createTestContext();
                const ctx2 = await createTestContext();

                await createTransaction(ctx1.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 1000,
                    date: "2026-08-20T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx1.categories.shopping.id,
                    sourceAccountId: ctx1.accounts.bank.id,
                });

                await createTransaction(ctx2.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 2500,
                    date: "2026-08-20T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx2.categories.shopping.id,
                    sourceAccountId: ctx2.accounts.bank.id,
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

                expect(Number(analytics1!.totalExpense)).toBe(1000);
                expect(Number(analytics2!.totalExpense)).toBe(2500);
            }, 15000);
        });
    });
});