import {TransactionType} from "@prisma/client";
import {prisma} from "../../database/prisma";
import {describe, expect, it} from "vitest";
import {
    createTransaction,
    deleteTransaction,
    restoreTransaction,
    updateTransaction,
} from "../../modules/transactions/transaction.service";
import {createTestContext} from "../helpers/context";

describe("Transfer Analytics", () => {
    it("records the transfer amount", async () => {
        const ctx = await createTestContext();

        await createTransaction(ctx.user.id, {
            type: TransactionType.TRANSFER,
            amount: 2500,
            date: "2026-08-15T10:00:00.000Z",
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

        expect(Number(analytics!.totalTransfer)).toBe(2500);
    });

    it("aggregates multiple transfers in the same month", async () => {
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

        const analytics = await prisma.monthlyAnalytics.findUnique({
            where: {
                userId_year_month: {
                    userId: ctx.user.id,
                    year: 2026,
                    month: 8,
                },
            },
        });

        expect(Number(analytics!.totalTransfer)).toBe(4000);
    });

    it("does not count a transfer as income or expense", async () => {
        const ctx = await createTestContext();

        await createTransaction(ctx.user.id, {
            type: TransactionType.TRANSFER,
            amount: 5000,
            date: "2026-08-15T10:00:00.000Z",
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

        expect(Number(analytics!.totalTransfer)).toBe(5000);
        expect(Number(analytics!.totalIncome)).toBe(0);
        expect(Number(analytics!.totalExpense)).toBe(0);
        expect(Number(analytics!.totalInvestment)).toBe(0);
    });

    it("updates transfer analytics when the amount changes", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(ctx.user.id, {
            type: TransactionType.TRANSFER,
            amount: 2000,
            date: "2026-08-15T10:00:00.000Z",
            sourceAccountId: ctx.accounts.bank.id,
            destinationAccountId: ctx.accounts.secondBank.id,
        });

        await updateTransaction(ctx.user.id, transaction.id, {
            amount: 3500,
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

        expect(Number(analytics!.totalTransfer)).toBe(3500);
    });

    it("moves transfer analytics when the date changes month", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(ctx.user.id, {
            type: TransactionType.TRANSFER,
            amount: 4000,
            date: "2026-08-20T10:00:00.000Z",
            sourceAccountId: ctx.accounts.bank.id,
            destinationAccountId: ctx.accounts.secondBank.id,
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

        expect(Number(august?.totalTransfer ?? 0)).toBe(0);
        expect(Number(september!.totalTransfer)).toBe(4000);
    });

    it("removes transfer analytics when deleted", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(ctx.user.id, {
            type: TransactionType.TRANSFER,
            amount: 4500,
            date: "2026-08-20T10:00:00.000Z",
            sourceAccountId: ctx.accounts.bank.id,
            destinationAccountId: ctx.accounts.secondBank.id,
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

        expect(Number(analytics?.totalTransfer ?? 0)).toBe(0);
    });

    it("restores transfer analytics when restored", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(ctx.user.id, {
            type: TransactionType.TRANSFER,
            amount: 4500,
            date: "2026-08-20T10:00:00.000Z",
            sourceAccountId: ctx.accounts.bank.id,
            destinationAccountId: ctx.accounts.secondBank.id,
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

        expect(Number(analytics!.totalTransfer)).toBe(4500);
    });
});