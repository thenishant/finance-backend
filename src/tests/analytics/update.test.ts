import {describe, expect, it} from "vitest";
import {createTestContext} from "../helpers/context";
import {
    createTransaction,
    deleteTransaction,
    restoreTransaction,
    updateTransaction
} from "../../modules/transactions/transaction.service";
import {TransactionType} from "@prisma/client";
import {prisma} from "../../database/prisma";
import {rebuildMonth} from "../../modules/analytics/analytics.rebuilder";

describe("Delete Restore Analytics", () => {
    it("removes and restores analytics through the delete/restore lifecycle", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(ctx.user.id, {
            type: TransactionType.EXPENSE,
            amount: 3500,
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

        expect(Number(analytics!.totalExpense)).toBe(3500);

        await deleteTransaction(
            ctx.user.id,
            transaction.id,
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

        expect(Number(analytics!.totalExpense)).toBe(0);

        await restoreTransaction(
            ctx.user.id,
            transaction.id,
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

        expect(Number(analytics!.totalExpense)).toBe(3500);
    });
    it("deletes a transaction from its current analytics month", async () => {
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
                date: "2026-09-10T10:00:00.000Z",
            },
        );

        await deleteTransaction(
            ctx.user.id,
            transaction.id,
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
        expect(Number(september!.totalExpense)).toBe(0);
    });
    it("restores a moved transaction into the correct month", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(ctx.user.id, {
            type: TransactionType.EXPENSE,
            amount: 4500,
            date: "2026-08-10T10:00:00.000Z",
            merchant: "Amazon",
            categoryId: ctx.categories.shopping.id,
            sourceAccountId: ctx.accounts.bank.id,
        });

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                date: "2026-09-10T10:00:00.000Z",
            },
        );

        await deleteTransaction(
            ctx.user.id,
            transaction.id,
        );

        await restoreTransaction(
            ctx.user.id,
            transaction.id,
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
        expect(Number(september!.totalExpense)).toBe(4500);
    });
    it("does not include a deleted transaction after other changes", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(ctx.user.id, {
            type: TransactionType.EXPENSE,
            amount: 5000,
            date: "2026-08-10T10:00:00.000Z",
            merchant: "Amazon",
            categoryId: ctx.categories.shopping.id,
            sourceAccountId: ctx.accounts.bank.id,
        });

        await deleteTransaction(
            ctx.user.id,
            transaction.id,
        );

        await prisma.transaction.update({
            where: {
                id: transaction.id,
            },
            data: {
                type: TransactionType.INCOME,
            },
        });

        await rebuildMonth(
            ctx.user.id,
            2026,
            8,
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
    });
});