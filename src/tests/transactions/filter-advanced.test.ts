import {describe, expect, it} from "vitest";
import {TransactionType} from "@prisma/client";

import {createTestContext} from "../helpers/context";
import {createTransaction, getTransactions,} from "../../modules/transactions/transaction.service";

describe("Transaction Filters", () => {
    it("filters transactions by type", async () => {
        const ctx = await createTestContext();

        await createTransaction(ctx.user.id, {
            type: TransactionType.EXPENSE,
            amount: 500,
            date: "2026-08-10T10:00:00.000Z",
            merchant: "Amazon",
            categoryId: ctx.categories.shopping.id,
            sourceAccountId: ctx.accounts.bank.id,
        });

        await createTransaction(ctx.user.id, {
            type: TransactionType.INCOME,
            amount: 5000,
            date: "2026-08-11T10:00:00.000Z",
            merchant: "Salary",
            categoryId: ctx.categories.salary.id,
            destinationAccountId: ctx.accounts.bank.id,
        });

        const expenses = await getTransactions(
            ctx.user.id,
            "date",
            "desc",
            {
                type: TransactionType.EXPENSE,
            },
        );

        expect(expenses).toHaveLength(1);
        expect(expenses[0].type).toBe(
            TransactionType.EXPENSE,
        );
        expect(expenses[0].merchant?.name).toBe("Amazon");
    });

    it("filters transactions by category", async () => {
        const ctx = await createTestContext();

        await createTransaction(ctx.user.id, {
            type: TransactionType.EXPENSE,
            amount: 500,
            date: "2026-08-10T10:00:00.000Z",
            merchant: "Amazon",
            categoryId: ctx.categories.shopping.id,
            sourceAccountId: ctx.accounts.bank.id,
        });

        await createTransaction(ctx.user.id, {
            type: TransactionType.EXPENSE,
            amount: 300,
            date: "2026-08-11T10:00:00.000Z",
            merchant: "Swiggy",
            categoryId: ctx.categories.food.id,
            sourceAccountId: ctx.accounts.bank.id,
        });

        const transactions = await getTransactions(
            ctx.user.id,
            "date",
            "desc",
            {
                categoryId: ctx.categories.shopping.id,
            },
        );

        expect(transactions).toHaveLength(1);
        expect(transactions[0].categoryId).toBe(
            ctx.categories.shopping.id,
        );
        expect(transactions[0].merchant?.name).toBe("Amazon");
    });

    it("filters transactions by account", async () => {
        const ctx = await createTestContext();

        await createTransaction(ctx.user.id, {
            type: TransactionType.EXPENSE,
            amount: 500,
            date: "2026-08-10T10:00:00.000Z",
            merchant: "Amazon",
            categoryId: ctx.categories.shopping.id,
            sourceAccountId: ctx.accounts.bank.id,
        });

        await createTransaction(ctx.user.id, {
            type: TransactionType.EXPENSE,
            amount: 300,
            date: "2026-08-11T10:00:00.000Z",
            merchant: "Swiggy",
            categoryId: ctx.categories.food.id,
            sourceAccountId: ctx.accounts.secondBank.id,
        });

        const transactions = await getTransactions(
            ctx.user.id,
            "date",
            "desc",
            {
                accountId: ctx.accounts.bank.id,
            },
        );

        expect(transactions).toHaveLength(1);
        expect(transactions[0].sourceAccountId).toBe(
            ctx.accounts.bank.id,
        );
        expect(transactions[0].merchant?.name).toBe("Amazon");
    });

    it("filters transactions by date range", async () => {
        const ctx = await createTestContext();

        await createTransaction(ctx.user.id, {
            type: TransactionType.EXPENSE,
            amount: 100,
            date: "2026-08-01T10:00:00.000Z",
            merchant: "Amazon",
            categoryId: ctx.categories.shopping.id,
            sourceAccountId: ctx.accounts.bank.id,
        });

        await createTransaction(ctx.user.id, {
            type: TransactionType.EXPENSE,
            amount: 200,
            date: "2026-08-15T10:00:00.000Z",
            merchant: "Amazon",
            categoryId: ctx.categories.shopping.id,
            sourceAccountId: ctx.accounts.bank.id,
        });

        await createTransaction(ctx.user.id, {
            type: TransactionType.EXPENSE,
            amount: 300,
            date: "2026-08-30T10:00:00.000Z",
            merchant: "Amazon",
            categoryId: ctx.categories.shopping.id,
            sourceAccountId: ctx.accounts.bank.id,
        });

        const transactions = await getTransactions(
            ctx.user.id,
            "date",
            "asc",
            {
                from: "2026-08-10T00:00:00.000Z",
                to: "2026-08-20T23:59:59.999Z",
            },
        );

        expect(transactions).toHaveLength(1);
        expect(Number(transactions[0].amount)).toBe(200);
        expect(transactions[0].merchant?.name).toBe("Amazon");
    });

    it("filters by multiple conditions together", async () => {
        const ctx = await createTestContext();

        await createTransaction(ctx.user.id, {
            type: TransactionType.EXPENSE,
            amount: 500,
            date: "2026-08-15T10:00:00.000Z",
            merchant: "Amazon",
            categoryId: ctx.categories.shopping.id,
            sourceAccountId: ctx.accounts.bank.id,
        });

        await createTransaction(ctx.user.id, {
            type: TransactionType.EXPENSE,
            amount: 300,
            date: "2026-08-15T12:00:00.000Z",
            merchant: "Swiggy",
            categoryId: ctx.categories.food.id,
            sourceAccountId: ctx.accounts.bank.id,
        });

        await createTransaction(ctx.user.id, {
            type: TransactionType.INCOME,
            amount: 5000,
            date: "2026-08-15T14:00:00.000Z",
            merchant: "Salary",
            categoryId: ctx.categories.salary.id,
            destinationAccountId: ctx.accounts.bank.id,
        });

        const transactions = await getTransactions(
            ctx.user.id,
            "date",
            "desc",
            {
                type: TransactionType.EXPENSE,
                categoryId: ctx.categories.shopping.id,
                accountId: ctx.accounts.bank.id,
            },
        );

        expect(transactions).toHaveLength(1);
        expect(transactions[0].type).toBe(
            TransactionType.EXPENSE,
        );
        expect(transactions[0].categoryId).toBe(
            ctx.categories.shopping.id,
        );
        expect(transactions[0].sourceAccountId).toBe(
            ctx.accounts.bank.id,
        );
        expect(transactions[0].merchant?.name).toBe(
            "Amazon",
        );
    });

    it("returns an empty array when no transactions match", async () => {
        const ctx = await createTestContext();

        await createTransaction(ctx.user.id, {
            type: TransactionType.EXPENSE,
            amount: 500,
            date: "2026-08-15T10:00:00.000Z",
            merchant: "Amazon",
            categoryId: ctx.categories.shopping.id,
            sourceAccountId: ctx.accounts.bank.id,
        });

        const transactions = await getTransactions(
            ctx.user.id,
            "date",
            "desc",
            {
                type: TransactionType.INCOME,
            },
        );

        expect(transactions).toHaveLength(0);
    });
});