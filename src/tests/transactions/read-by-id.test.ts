import {describe, expect, it} from "vitest";
import {TransactionType} from "@prisma/client";

import {prisma} from "../../database/prisma";
import {createTransaction, getTransactionById,} from "../../modules/transactions/transaction.service";

import {createTestContext} from "../helpers/context";

describe("Get Transaction By ID", () => {
    it("returns an existing active transaction", async () => {
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

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result).not.toBeNull();
        expect(result!.id).toBe(transaction.id);
        expect(Number(result!.amount)).toBe(500);
    });

    it("returns null for a non-existent transaction", async () => {
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

        await expect(
            getTransactionById(
                ctx.user.id,
                transaction.id,
            ),
        ).rejects.toThrow("Transaction not found");
    });

    it("returns the transaction with its category", async () => {
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

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result!.category).toBeDefined();
        expect(result!.category!.id).toBe(
            ctx.categories.shopping.id,
        );
    });

    it("returns the transaction with its merchant", async () => {
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

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result!.merchant).toBeDefined();
        expect(result!.merchant!.id).toBe(
            ctx.merchants.amazon.id,
        );
    });

    it("returns the source account", async () => {
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

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result!.sourceAccount).toBeDefined();
        expect(result!.sourceAccount!.id).toBe(
            ctx.accounts.bank.id,
        );
    });

    it("returns an income transaction with its destination account", async () => {
        const ctx = await createTestContext();

        const transaction = await prisma.transaction.create({
            data: {
                userId: ctx.user.id,
                type: TransactionType.INCOME,
                amount: 5000,
                date: new Date("2026-08-25T10:00:00.000Z"),
                year: 2026,
                month: 8,
                merchantId: ctx.merchants.swiggy.id,
                merchantRaw: "Salary",
                merchantNormalized: "salary",
                categoryId: ctx.categories.salary.id,
                destinationAccountId: ctx.accounts.bank.id,
                categoryAssignmentSource: "USER",
            },
        });

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result!.destinationAccount).toBeDefined();
        expect(result!.destinationAccount!.id).toBe(
            ctx.accounts.bank.id,
        );
    });

    it("returns a transfer with both accounts", async () => {
        const ctx = await createTestContext();

        const transaction = await prisma.transaction.create({
            data: {
                userId: ctx.user.id,
                type: TransactionType.TRANSFER,
                amount: 1000,
                date: new Date("2026-08-25T10:00:00.000Z"),
                year: 2026,
                month: 8,
                sourceAccountId: ctx.accounts.bank.id,
                destinationAccountId: ctx.accounts.investment.id,
            },
        });

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result!.sourceAccount).toBeDefined();
        expect(result!.destinationAccount).toBeDefined();

        expect(result!.sourceAccount!.id).toBe(
            ctx.accounts.bank.id,
        );

        expect(result!.destinationAccount!.id).toBe(
            ctx.accounts.investment.id,
        );
    });

    it("returns the stored note", async () => {
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
                note: "Test purchase",
            },
        });

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result!.note).toBe("Test purchase");
    });
});

describe("serialization", () => {
    it("returns a serialized amount without losing precision", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 123456.78,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result).not.toBeNull();

        expect(Number(result!.amount)).toBeCloseTo(
            123456.78,
            2,
        );
    });

    it("returns the correct transaction type", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.INVESTMENT,
                amount: 2500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Mutual Fund",
                categoryId: ctx.categories.investment.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result!.type).toBe(
            TransactionType.INVESTMENT,
        );
    });

    it("returns the correct year and month", async () => {
        const ctx = await createTestContext();

        const transaction = await createTransaction(
            ctx.user.id,
            {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-11-15T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
            },
        );

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result!.year).toBe(2026);
        expect(result!.month).toBe(11);
    });
});

describe("merchant data", () => {
    it("returns the merchant attached to the transaction", async () => {
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

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result!.merchant).toBeDefined();
        expect(result!.merchant!.name).toBe("Amazon");
    });

    it("returns null merchant when a transaction has no merchant", async () => {
        const ctx = await createTestContext();

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

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result!.merchant).toBeNull();
    });
});

describe("account relationships", () => {
    it("returns the source account for an expense", async () => {
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

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result!.sourceAccount).toBeDefined();
        expect(result!.sourceAccount!.id).toBe(
            ctx.accounts.bank.id,
        );
        expect(result!.destinationAccount).toBeNull();
    });

    it("returns the destination account for an income", async () => {
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
                ctx.accounts.secondBank.id,
            },
        );

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result!.destinationAccount).toBeDefined();
        expect(result!.destinationAccount!.id).toBe(
            ctx.accounts.secondBank.id,
        );
        expect(result!.sourceAccount).toBeNull();
    });

    it("returns both accounts for a transfer", async () => {
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

        const result = await getTransactionById(
            ctx.user.id,
            transaction.id,
        );

        expect(result!.sourceAccount).toBeDefined();
        expect(result!.destinationAccount).toBeDefined();

        expect(result!.sourceAccount!.id).toBe(
            ctx.accounts.bank.id,
        );

        expect(result!.destinationAccount!.id).toBe(
            ctx.accounts.secondBank.id,
        );
    });
    describe("serialization", () => {
        it("returns the correct amount as a number", async () => {
            const ctx = await createTestContext();

            const transaction = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.EXPENSE,
                    amount: 1234.56,
                    date: "2026-08-25T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                },
            );

            const result = await getTransactionById(
                ctx.user.id,
                transaction.id,
            );

            expect(typeof result.amount).toBe("number");
            expect(result.amount).toBe(1234.56);
        });

        it("returns the correct transaction type", async () => {
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

            const result = await getTransactionById(
                ctx.user.id,
                transaction.id,
            );

            expect(result.type).toBe(TransactionType.INCOME);
        });
    });

});