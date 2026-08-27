import {describe, expect, it} from "vitest";

import {createTestContext} from "../helpers/context";
import {createTransaction, deleteTransaction, updateTransaction} from "../../modules/transactions/transaction.service";
import {CategoryAssignmentSource, TransactionType} from "@prisma/client";
import {createBankAccount, createCategory, createUser} from "../helpers/factory";
import {prisma} from "../../database/prisma";
import {expectMonthlyTotals} from "../helpers/assertions";
import {createExpense} from "../helpers/transactions";

describe("merchant updates", () => {
    it("updates the merchant", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        const updated = await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                merchant: "Swiggy",
            },
        );

        expect(updated.merchant?.name).toBe("Swiggy");
    });

    it("creates or resolves a merchant when updating to a new merchant", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        const updated = await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                merchant: "Netflix",
            },
        );

        expect(updated.merchant).toBeDefined();
        expect(updated.merchant?.name).toBe("Netflix");
    });
});

describe("note updates", () => {
    it("updates an existing note", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
                note: "Original note",
            },
        );

        const updated = await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                note: "Updated note",
            },
        );

        expect(updated.note).toBe("Updated note");
    });

    it("adds a note to a transaction that had no note", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        const updated = await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                note: "Added later",
            },
        );

        expect(updated.note).toBe("Added later");
    });
});

describe("clearing optional fields", () => {
    it("clears the transaction note", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
                note: "Remove me",
            },
        );

        const updated = await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                note: null,
            },
        );

        expect(updated.note).toBeNull();
    });
});

describe("credit card transfers", () => {
    it("transfers money from a bank account to a credit card", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.TRANSFER,
                amount: 2000,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Credit Card Payment",
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId: ctx.accounts.creditCard.id,
            },
        );

        expect(transaction.sourceAccountId).toBe(
            ctx.accounts.bank.id,
        );

        expect(transaction.destinationAccountId).toBe(
            ctx.accounts.creditCard.id,
        );

        const entries = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
        });

        expect(entries).toHaveLength(2);

        const source = entries.find(
            (entry) =>
                entry.financialAccountId === ctx.accounts.bank.id,
        );

        const destination = entries.find(
            (entry) =>
                entry.financialAccountId ===
                ctx.accounts.creditCard.id,
        );

        expect(Number(source!.amount)).toBe(-2000);
        expect(Number(destination!.amount)).toBe(2000);
    });

    it("transfers money from a credit card to a bank account", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.TRANSFER,
                amount: 1000,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Credit Card Transfer",
                sourceAccountId: ctx.accounts.creditCard.id,
                destinationAccountId: ctx.accounts.bank.id,
            },
        );

        const entries = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
        });

        expect(entries).toHaveLength(2);

        const source = entries.find(
            (entry) =>
                entry.financialAccountId ===
                ctx.accounts.creditCard.id,
        );

        const destination = entries.find(
            (entry) =>
                entry.financialAccountId === ctx.accounts.bank.id,
        );

        expect(Number(source!.amount)).toBe(-1000);
        expect(Number(destination!.amount)).toBe(1000);
    });
});

describe("account updates", () => {
    it("updates the source account of an expense", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        const updated = await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                sourceAccountId: ctx.accounts.secondBank.id,
            },
        );

        expect(updated.sourceAccountId).toBe(ctx.accounts.secondBank.id);

        const ledgerEntries = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
        });

        expect(ledgerEntries).toHaveLength(1);
        expect(ledgerEntries[0].financialAccountId).toBe(
            ctx.accounts.secondBank.id,
        );
        expect(Number(ledgerEntries[0].amount)).toBe(-500);
    });

    it("updates both accounts of a transfer", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.TRANSFER,
                amount: 1000,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Transfer",
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId: ctx.accounts.secondBank.id,
            },
        );

        const updated = await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                sourceAccountId: ctx.accounts.secondBank.id,
                destinationAccountId: ctx.accounts.creditCard.id,
            },
        );

        expect(updated.sourceAccountId).toBe(
            ctx.accounts.secondBank.id,
        );

        expect(updated.destinationAccountId).toBe(
            ctx.accounts.creditCard.id,
        );

        const ledgerEntries = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
            orderBy: {
                amount: "asc",
            },
        });

        expect(ledgerEntries).toHaveLength(2);

        const sourceEntry = ledgerEntries.find(
            (entry) =>
                entry.financialAccountId === ctx.accounts.secondBank.id,
        );

        const destinationEntry = ledgerEntries.find(
            (entry) =>
                entry.financialAccountId === ctx.accounts.creditCard.id,
        );

        expect(sourceEntry).toBeDefined();
        expect(destinationEntry).toBeDefined();

        expect(Number(sourceEntry!.amount)).toBe(-1000);
        expect(Number(destinationEntry!.amount)).toBe(1000);
    });

    it("rejects changing a transfer to the same source and destination account", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.TRANSFER,
                amount: 1000,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Transfer",
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId: ctx.accounts.secondBank.id,
            },
        );

        await expect(
            updateTransaction(
                ctx.user.id,
                transaction.id,
                {
                    sourceAccountId: ctx.accounts.bank.id,
                    destinationAccountId: ctx.accounts.bank.id,
                },
            ),
        ).rejects.toThrow(
            "Cannot transfer to the same account.",
        );
    });

    it(
        "rejects changing to another user's account",
        async () => {
            const ctx = await createTestContext();
            const otherCtx = await createTestContext();

            const transaction = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.EXPENSE,
                    amount: 500,
                    date: "2026-08-25T10:00:00.000Z",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                },
            );

            await expect(
                updateTransaction(
                    ctx.user.id,
                    transaction.id,
                    {
                        sourceAccountId:
                        otherCtx.accounts.bank.id,
                    },
                ),
            ).rejects.toThrow(
                "Source account is required.",
            );
        },
    );
});

describe("category updates", () => {
    it("updates the category of an expense transaction", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        const updated = await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                categoryId: ctx.categories.food.id,
            },
        );

        expect(updated.categoryId).toBe(ctx.categories.food.id);
    });

    it("rejects a category belonging to another transaction type", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        await expect(
            updateTransaction(
                ctx.user.id,
                transaction.id,
                {
                    categoryId: ctx.categories.salary.id,
                },
            ),
        ).rejects.toThrow();
    });

    it("rejects a category belonging to another user", async () => {
        const ctx = await createTestContext();
        const otherCtx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        await expect(
            updateTransaction(
                ctx.user.id,
                transaction.id,
                {
                    categoryId: otherCtx.categories.shopping.id,
                },
            ),
        ).rejects.toThrow();
    }, 10000);
});

describe("transaction type changes", () => {
    it("changes an expense to an investment and updates the ledger", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                type: TransactionType.INVESTMENT,
                categoryId: ctx.categories.investment.id,
            },
        );

        const updated = await prisma.transaction.findUnique({
            where: {
                id: transaction.id,
            },
        });

        expect(updated).not.toBeNull();
        expect(updated!.type).toBe(
            TransactionType.INVESTMENT,
        );
        expect(updated!.categoryId).toBe(
            ctx.categories.investment.id,
        );

        const entries = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
        });

        expect(entries).toHaveLength(1);
        expect(entries[0].financialAccountId).toBe(
            ctx.accounts.bank.id,
        );
        expect(Number(entries[0].amount)).toBe(-500);
    });

    it("changes an expense to income and makes the ledger positive", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                type: TransactionType.INCOME,
                categoryId: ctx.categories.salary.id,
                destinationAccountId:
                ctx.accounts.secondBank.id,
            },
        );

        const updated = await prisma.transaction.findUnique({
            where: {
                id: transaction.id,
            },
        });

        expect(updated!.type).toBe(
            TransactionType.INCOME,
        );

        expect(updated!.categoryId).toBe(
            ctx.categories.salary.id,
        );

        const entries = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
        });

        expect(entries).toHaveLength(1);
        expect(entries[0].financialAccountId).toBe(
            ctx.accounts.secondBank.id,
        );
        expect(Number(entries[0].amount)).toBe(500);
    }, 15000);

    it("changes income to expense and makes the ledger negative", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.INCOME,
                amount: 2500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Salary",
                categoryId: ctx.categories.salary.id,
                destinationAccountId:
                ctx.accounts.bank.id,
            },
        );

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                type: TransactionType.EXPENSE,
                categoryId: ctx.categories.shopping.id,
                sourceAccountId:
                ctx.accounts.secondBank.id,
            },
        );

        const updated = await prisma.transaction.findUnique({
            where: {
                id: transaction.id,
            },
        });

        expect(updated!.type).toBe(
            TransactionType.EXPENSE,
        );

        expect(updated!.categoryId).toBe(
            ctx.categories.shopping.id,
        );

        const entries = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
        });

        expect(entries).toHaveLength(1);
        expect(entries[0].financialAccountId).toBe(
            ctx.accounts.secondBank.id,
        );
        expect(Number(entries[0].amount)).toBe(-2500);
    });
});

describe("account changes", () => {
    it("moves an expense to a different source account", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                sourceAccountId: ctx.accounts.secondBank.id,
            },
        );

        const entries = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
        });

        expect(entries).toHaveLength(1);

        expect(entries[0].financialAccountId).toBe(
            ctx.accounts.secondBank.id,
        );

        expect(Number(entries[0].amount)).toBe(-500);
    });

    it("moves an income to a different destination account", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.INCOME,
                amount: 5000,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Salary",
                categoryId: ctx.categories.salary.id,
                destinationAccountId: ctx.accounts.bank.id,
            },
        );

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                destinationAccountId:
                ctx.accounts.secondBank.id,
            },
        );

        const entries = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
        });

        expect(entries).toHaveLength(1);

        expect(entries[0].financialAccountId).toBe(
            ctx.accounts.secondBank.id,
        );

        expect(Number(entries[0].amount)).toBe(5000);
    });

    it("moves both sides of a transfer to different accounts", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.TRANSFER,
                amount: 1000,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Transfer",
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId:
                ctx.accounts.secondBank.id,
            },
        );

        // Create another account for the new destination.
        const newDestination = await createBankAccount(
            ctx.user.id,
        );

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                sourceAccountId:
                ctx.accounts.secondBank.id,
                destinationAccountId:
                newDestination.id,
            },
        );

        const entries = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
        });

        expect(entries).toHaveLength(2);

        const sourceEntry = entries.find(
            entry =>
                entry.financialAccountId ===
                ctx.accounts.secondBank.id,
        );

        const destinationEntry = entries.find(
            entry =>
                entry.financialAccountId ===
                newDestination.id,
        );

        expect(sourceEntry).toBeDefined();
        expect(destinationEntry).toBeDefined();

        expect(Number(sourceEntry!.amount)).toBe(-1000);
        expect(Number(destinationEntry!.amount)).toBe(1000);
    }, 15000);
});

describe("ledger consistency", () => {
    it("updates the ledger amount when an expense amount changes", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        const before = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
        });

        expect(before).toHaveLength(1);
        expect(Number(before[0].amount)).toBe(-500);

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                amount: 750,
            },
        );

        const after = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
        });

        expect(after).toHaveLength(1);
        expect(Number(after[0].amount)).toBe(-750);
    });

    it("updates both ledger entries when a transfer amount changes", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.TRANSFER,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Transfer",
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId: ctx.accounts.secondBank.id,
            },
        );

        const before = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
            orderBy: {
                amount: "asc",
            },
        });

        expect(before).toHaveLength(2);
        expect(Number(before[0].amount)).toBe(-500);
        expect(Number(before[1].amount)).toBe(500);

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                amount: 750,
            },
        );

        const after = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
            orderBy: {
                amount: "asc",
            },
        });

        expect(after).toHaveLength(2);
        expect(Number(after[0].amount)).toBe(-750);
        expect(Number(after[1].amount)).toBe(750);
    });

    it("keeps the ledger balanced after a transfer amount update", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.TRANSFER,
                amount: 1000,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Transfer",
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId: ctx.accounts.secondBank.id,
            },
        );

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                amount: 2500,
            },
        );

        const entries = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: transaction.id,
            },
        });

        expect(entries).toHaveLength(2);

        const total = entries.reduce(
            (sum, entry) => sum + Number(entry.amount),
            0,
        );

        expect(total).toBe(0);
    });
});

describe("Update Transaction", () => {

    it("updates expense amount", async () => {

        const ctx = await createTestContext();
        console.time("createExpense");

        const expense = await createExpense(ctx, {
            amount: 500,
        });
        console.timeEnd("createExpense");
        console.time("updateTransaction");

        await updateTransaction(
            ctx.user.id,
            expense.id,
            {
                type: expense.type,
                amount: 1000,
                date: expense.date,
                merchant: expense.merchant?.name ?? undefined,
                categoryId: expense.category?.id,
                sourceAccountId: expense.sourceAccount?.id,
                destinationAccountId: expense.destinationAccount?.id,
                note: expense.note ?? undefined,
            },
        );
        console.timeEnd("updateTransaction");

        await expectMonthlyTotals(
            ctx.user.id,
            2026,
            8,
            {
                expense: 1000,
            },
        );

    });

    it("moves transaction to another month", async () => {
        const ctx = await createTestContext();
        const expense = await createExpense(ctx, {
            amount: 500,
            date: "2026-08-10",
        });

        await updateTransaction(ctx.user.id, expense.id,
            {
                type: expense.type,
                amount: 500,
                date: "2026-09-05",
                merchant: expense.merchant?.name ?? undefined,
                categoryId: expense.category?.id,
                sourceAccountId: expense.sourceAccount?.id,
                destinationAccountId: expense.destinationAccount?.id,
                note: expense.note ?? undefined,
            },
        );

        await expectMonthlyTotals(
            ctx.user.id,
            2026,
            8,
            {
                expense: 0,
            },
        );

        await expectMonthlyTotals(
            ctx.user.id,
            2026,
            9,
            {
                expense: 500,
            },
        );

    }, 1500);
});

describe("analytics consistency", () => {
    it("updates monthly analytics when the transaction amount changes", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        const before = await prisma.monthlyAnalytics.findMany({
            where: {
                userId: ctx.user.id,
            },
        });

        expect(before).toHaveLength(1);

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                amount: 750,
            },
        );

        const after = await prisma.monthlyAnalytics.findMany({
            where: {
                userId: ctx.user.id,
            },
        });

        expect(after).toHaveLength(1);

        expect(Number(after[0].totalExpense)).toBe(750);
    }, 10000);

    it("moves analytics when a transaction moves to another month", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                date: "2026-09-10T10:00:00.000Z",
            },
        );

        const august = await prisma.monthlyAnalytics.findFirst({
            where: {
                userId: ctx.user.id,
                year: 2026,
                month: 8,
            },
        });

        const september = await prisma.monthlyAnalytics.findFirst({
            where: {
                userId: ctx.user.id,
                year: 2026,
                month: 9,
            },
        });

        expect(Number(august?.totalExpense ?? 0)).toBe(0);
        expect(Number(september?.totalExpense ?? 0)).toBe(500);
    }, 10000);

    it("updates income analytics when an income amount changes", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.INCOME,
                amount: 5000,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Salary",
                categoryId: ctx.categories.salary.id,
                destinationAccountId:
                ctx.accounts.bank.id,
            },
        );

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                amount: 7500,
            },
        );

        const analytics =
            await prisma.monthlyAnalytics.findFirst({
                where: {
                    userId: ctx.user.id,
                    year: 2026,
                    month: 8,
                },
            });

        expect(analytics).not.toBeNull();
        expect(Number(analytics!.totalIncome)).toBe(7500);
    }, 10000);
});

describe("category changes", () => {
    it("changes an expense category", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                categoryId: ctx.categories.food.id,
            },
        );

        const updated = await prisma.transaction.findUnique({
            where: {
                id: transaction.id,
            },
        });

        expect(updated!.categoryId).toBe(
            ctx.categories.food.id,
        );
    });

    it("changes an income category", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.INCOME,
                amount: 5000,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Salary",
                categoryId: ctx.categories.salary.id,
                destinationAccountId:
                ctx.accounts.bank.id,
            },
        );

        // Use another income category so the test only
        // exercises a valid category change.
        const otherIncomeCategory = await createCategory(
            ctx.user.id,
            "Bonus",
            TransactionType.INCOME,
        );

        await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                categoryId: otherIncomeCategory.id,
            },
        );

        const updated = await prisma.transaction.findUnique({
            where: {
                id: transaction.id,
            },
        });

        expect(updated!.categoryId).toBe(
            otherIncomeCategory.id,
        );
    });

    it("rejects changing an expense to an income category", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        await expect(
            updateTransaction(
                ctx.user.id,
                transaction.id,
                {
                    categoryId: ctx.categories.salary.id,
                },
            ),
        ).rejects.toThrow();
    });

    it("rejects changing to a category belonging to another user", async () => {
        const ctx = await createTestContext();

        const otherUser = await createUser();

        const otherCategory = await createCategory(
            otherUser.id,
            "Other Shopping",
            TransactionType.EXPENSE,
        );

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        await expect(
            updateTransaction(
                ctx.user.id,
                transaction.id,
                {
                    categoryId: otherCategory.id,
                },
            ),
        ).rejects.toThrow();
    });
});

describe("validation", () => {
    it("rejects a zero amount", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        await expect(
            updateTransaction(
                ctx.user.id,
                transaction.id,
                {
                    amount: 0,
                },
            ),
        ).rejects.toThrow();
    });

    it("rejects a negative amount", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        await expect(
            updateTransaction(
                ctx.user.id,
                transaction.id,
                {
                    amount: -100,
                },
            ),
        ).rejects.toThrow();
    });

    it("rejects an invalid date", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        await expect(
            updateTransaction(
                ctx.user.id,
                transaction.id,
                {
                    date: "not-a-date",
                },
            ),
        ).rejects.toThrow();
    });

    it("rejects updating a non-existent transaction", async () => {
        const ctx = await createTestContext();

        await expect(
            updateTransaction(
                ctx.user.id,
                "00000000-0000-0000-0000-000000000000",
                {
                    amount: 750,
                },
            ),
        ).rejects.toThrow();
    });

    it("rejects updating another user's transaction", async () => {
        const ctx = await createTestContext();

        const otherUser = await createUser();

        const otherAccount = await createBankAccount(
            otherUser.id,
        );

        const otherCategory = await createCategory(
            otherUser.id,
            "Other Shopping",
            TransactionType.EXPENSE,
        );

        const transaction = await createTransaction(
            otherUser.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: otherCategory.id,
                sourceAccountId: otherAccount.id,
            },
        );

        await expect(
            updateTransaction(
                ctx.user.id,
                transaction.id,
                {
                    amount: 750,
                },
            ),
        ).rejects.toThrow();
    });

    it("rejects updating a deleted transaction", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        await deleteTransaction(
            ctx.user.id,
            transaction.id,
        );

        await expect(
            updateTransaction(
                ctx.user.id,
                transaction.id,
                {
                    amount: 750,
                },
            ),
        ).rejects.toThrow();
    });

    describe("date updates", () => {
        it("updates the transaction date", async () => {
            const ctx = await createTestContext();

            const transaction = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.EXPENSE,
                    amount: 500,
                    date: "2026-08-10T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                },
            );

            const updated = await updateTransaction(
                ctx.user.id,
                transaction.id,
                {
                    date: "2026-09-15T10:00:00.000Z",
                },
            );

            expect(
                new Date(updated.date).toISOString(),
            ).toBe("2026-09-15T10:00:00.000Z");

            expect(updated.year).toBe(2026);
            expect(updated.month).toBe(9);
        });

        it("updates year and month when crossing a year boundary", async () => {
            const ctx = await createTestContext();

            const transaction = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.EXPENSE,
                    amount: 500,
                    date: "2026-12-15T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                },
            );

            const updated = await updateTransaction(
                ctx.user.id,
                transaction.id,
                {
                    date: "2027-01-10T10:00:00.000Z",
                },
            );

            expect(updated.year).toBe(2027);
            expect(updated.month).toBe(1);
        });

        it("rejects an invalid date update", async () => {
            const ctx = await createTestContext();

            const transaction = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.EXPENSE,
                    amount: 500,
                    date: "2026-08-15T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                },
            );

            await expect(
                updateTransaction(
                    ctx.user.id,
                    transaction.id,
                    {
                        date: "not-a-date",
                    },
                ),
            ).rejects.toThrow();
        });
    });
});

describe("merchant edge cases", () => {
    it("clears the merchant", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        const updated = await updateTransaction(
            ctx.user.id,
            transaction.id, {
                merchant: null,
            },
        );

        expect(updated.merchantId).toBeNull();
        expect(updated.merchantRaw).toBeNull();
        expect(updated.merchantNormalized).toBeNull();
    });

    it("trims whitespace from a new merchant", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        const updated = await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                merchant: "  Netflix  ",
            },
        );

        expect(updated.merchant).toBeDefined();
        expect(updated.merchant?.name).toBe("Netflix");
    });

    it("uses the explicit category when merchant and category are both changed", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        const updated = await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                merchant: "Netflix",
                categoryId: ctx.categories.entertainment.id,
            },
        );

        expect(updated.merchant?.name).toBe("Netflix");
        expect(updated.categoryId).toBe(ctx.categories.entertainment.id,);
        expect(updated.categoryAssignmentSource).toBe(
            CategoryAssignmentSource.USER,
        );
        expect(updated.aiCategoryConfidence).toBeNull();
    });
});


describe("category edge cases", () => {
    it("clears the category", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        await expect(
            updateTransaction(
                ctx.user.id,
                transaction.id,
                {
                    categoryId: null,
                },
            ),
        ).rejects.toThrow(
            "Category is required.",
        );
    });
});


describe("combined updates", () => {
    it("updates merchant and transaction type together", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        const updated = await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                type: TransactionType.INVESTMENT,
                merchant: "Zerodha",
                categoryId: ctx.categories.investment.id,
            },
        );

        expect(updated.type).toBe(
            TransactionType.INVESTMENT,
        );

        expect(updated.merchant?.name).toBe(
            "Zerodha",
        );

        expect(updated.categoryId).toBe(
            ctx.categories.investment.id,
        );
    });

    it("updates a transfer merchant without creating a category", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.TRANSFER,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Transfer",
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId: ctx.accounts.secondBank.id,
            },
        );

        const updated = await updateTransaction(
            ctx.user.id,
            transaction.id,
            {
                merchant: "Credit Card Transfer",
            },
        );

        expect(updated.merchant?.name).toBe(
            "Credit Card Transfer",
        );

        expect(updated.categoryId).toBeNull();
    });

    it("supports a no-op update", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
                note: "Original note",
            },
        );

        const updated = await updateTransaction(
            ctx.user.id,
            transaction.id,
            {},
        );

        expect(updated.id).toBe(
            transaction.id,
        );

        expect(updated.amount).toEqual(
            transaction.amount,
        );

        expect(updated.merchant?.name).toBe(
            "Amazon",
        );

        expect(updated.categoryId).toBe(
            ctx.categories.shopping.id,
        );

        expect(updated.note).toBe(
            "Original note",
        );
    });
});

