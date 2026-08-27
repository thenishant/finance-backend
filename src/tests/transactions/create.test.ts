import {describe, expect, it} from "vitest";
import {TransactionType} from "@prisma/client";
import {prisma} from "../../database/prisma";
import {createTransaction} from "../../modules/transactions/transaction.service";
import {createTestContext} from "../helpers/context";
import {randomUUID} from "node:crypto";


describe("Create Transaction", () => {

    describe("successful creation", () => {

        it("creates an expense transaction", async () => {
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

            expect(transaction.id).toBeDefined();
            expect(transaction.userId).toBe(ctx.user.id);
            expect(transaction.type).toBe(
                TransactionType.EXPENSE,
            );
            expect(Number(transaction.amount)).toBe(500);
            expect(transaction.sourceAccountId).toBe(
                ctx.accounts.bank.id,
            );
            expect(transaction.destinationAccountId).toBeNull();
            expect(transaction.categoryId).toBe(
                ctx.categories.shopping.id,
            );
            expect(transaction.merchantRaw).toBe("Amazon");

            const ledgerEntries =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId: transaction.id,
                    },
                });

            expect(ledgerEntries.length).toBeGreaterThan(0);
        });


        it("creates an income transaction", async () => {
            const ctx = await createTestContext();

            const transaction = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.INCOME,
                    amount: 100000,
                    date: "2026-08-25T10:00:00.000Z",
                    merchant: "Salary",
                    categoryId: ctx.categories.salary.id,
                    destinationAccountId:
                    ctx.accounts.bank.id,
                },
            );

            expect(transaction.type).toBe(
                TransactionType.INCOME,
            );

            expect(Number(transaction.amount)).toBe(
                100000,
            );

            expect(transaction.sourceAccountId).toBeNull();

            expect(transaction.destinationAccountId).toBe(
                ctx.accounts.bank.id,
            );

            expect(transaction.categoryId).toBe(
                ctx.categories.salary.id,
            );

            const ledgerEntries =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId: transaction.id,
                    },
                });

            expect(ledgerEntries.length).toBeGreaterThan(0);
            expect(ledgerEntries).toHaveLength(1);
            expect(ledgerEntries[0].financialAccountId).toBe(ctx.accounts.bank.id,);
            expect(Number(ledgerEntries[0].amount),).toBe(100000);
        });

        it("creates an investment transaction", async () => {
            const ctx = await createTestContext();

            const transaction = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.INVESTMENT,
                    amount: 5000,
                    date: "2026-08-25T10:00:00.000Z",
                    merchant: "Mutual Fund",
                    categoryId:
                    ctx.categories.investment.id,
                    sourceAccountId:
                    ctx.accounts.bank.id,
                },
            );

            expect(transaction.type).toBe(TransactionType.INVESTMENT,);
            expect(Number(transaction.amount)).toBe(5000,);
            expect(transaction.sourceAccountId).toBe(ctx.accounts.bank.id,);
            expect(transaction.destinationAccountId).toBeNull();
            expect(transaction.categoryId).toBe(ctx.categories.investment.id,);

            const ledgerEntries =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId: transaction.id,
                    },
                });
            expect(ledgerEntries.length).toBeGreaterThan(0);
        });


        it("creates a transfer transaction", async () => {
            const ctx = await createTestContext();
            const transaction = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.TRANSFER,
                    amount: 2500,
                    date: "2026-08-25T10:00:00.000Z",
                    sourceAccountId:
                    ctx.accounts.bank.id,
                    destinationAccountId:
                    ctx.accounts.investment.id,
                },
            );

            expect(transaction.type).toBe(
                TransactionType.TRANSFER,
            );

            expect(Number(transaction.amount)).toBe(
                2500,
            );

            expect(transaction.sourceAccountId).toBe(
                ctx.accounts.bank.id,
            );

            expect(transaction.destinationAccountId).toBe(
                ctx.accounts.investment.id,
            );

            expect(transaction.categoryId).toBeNull();

            const ledgerEntries =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId: transaction.id,
                    },
                });

            expect(ledgerEntries.length).toBeGreaterThan(0);
        });

    });


    describe("category handling", () => {

        it("uses the explicitly supplied category", async () => {
            const ctx = await createTestContext();

            const transaction = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.EXPENSE,
                    amount: 1000,
                    date: "2026-08-25T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.food.id,
                    sourceAccountId:
                    ctx.accounts.bank.id,
                },
            );

            expect(transaction.categoryId).toBe(
                ctx.categories.food.id,
            );

            expect(
                transaction.categoryAssignmentSource,
            ).toBe("USER");

            expect(
                transaction.aiCategoryConfidence,
            ).toBeNull();
        });


        it("does not assign a category to a transfer", async () => {
            const ctx = await createTestContext();

            const transaction = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.TRANSFER,
                    amount: 1000,
                    date: "2026-08-25T10:00:00.000Z",
                    categoryId:
                    ctx.categories.shopping.id,
                    sourceAccountId:
                    ctx.accounts.bank.id,
                    destinationAccountId:
                    ctx.accounts.investment.id,
                },
            );

            expect(transaction.categoryId).toBeNull();
        });


        it("rejects a category belonging to another transaction type", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.EXPENSE,
                        amount: 1000,
                        date: "2026-08-25T10:00:00.000Z",
                        categoryId:
                        ctx.categories.salary.id,
                        sourceAccountId:
                        ctx.accounts.bank.id,
                    },
                ),
            ).rejects.toThrow(
                "Category type does not match transaction type.",
            );
        });


        it("rejects an invalid category", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.EXPENSE,
                        amount: 1000,
                        date: "2026-08-25T10:00:00.000Z",
                        categoryId:
                            "00000000-0000-0000-0000-000000000000",
                        sourceAccountId:
                        ctx.accounts.bank.id,
                    },
                ),
            ).rejects.toThrow("Invalid category.");
        });

    });


    describe("account validation", () => {

        it("rejects an expense without a source account", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.EXPENSE,
                        amount: 500,
                        date: "2026-08-25T10:00:00.000Z",
                        categoryId:
                        ctx.categories.shopping.id,
                    },
                ),
            ).rejects.toThrow(
                "Source account is required.",
            );
        });


        it("rejects an investment without a source account", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.INVESTMENT,
                        amount: 500,
                        date: "2026-08-25T10:00:00.000Z",
                        categoryId:
                        ctx.categories.investment.id,
                    },
                ),
            ).rejects.toThrow(
                "Source account is required.",
            );
        });


        it("rejects income without a destination account", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.INCOME,
                        amount: 50000,
                        date: "2026-08-25T10:00:00.000Z",
                        categoryId:
                        ctx.categories.salary.id,
                    },
                ),
            ).rejects.toThrow(
                "Destination account is required.",
            );
        });


        it("rejects a transfer without both accounts", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.TRANSFER,
                        amount: 1000,
                        date: "2026-08-25T10:00:00.000Z",
                        sourceAccountId:
                        ctx.accounts.bank.id,
                    },
                ),
            ).rejects.toThrow(
                "Both accounts are required.",
            );
        });


        it("rejects a transfer to the same account", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.TRANSFER,
                        amount: 1000,
                        date: "2026-08-25T10:00:00.000Z",
                        sourceAccountId:
                        ctx.accounts.bank.id,
                        destinationAccountId:
                        ctx.accounts.bank.id,
                    },
                ),
            ).rejects.toThrow(
                "Cannot transfer to the same account.",
            );
        });


        it("rejects an invalid source account", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.EXPENSE,
                        amount: 500,
                        date: "2026-08-25T10:00:00.000Z",
                        categoryId:
                        ctx.categories.shopping.id,
                        sourceAccountId:
                            "00000000-0000-0000-0000-000000000000",
                    },
                ),
            ).rejects.toThrow(
                "Source account is required.",
            );
        });

    });


    describe("amount and date validation", () => {

        it("rejects zero amount", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.EXPENSE,
                        amount: 0,
                        date: "2026-08-25T10:00:00.000Z",
                        categoryId:
                        ctx.categories.shopping.id,
                        sourceAccountId:
                        ctx.accounts.bank.id,
                    },
                ),
            ).rejects.toThrow(
                "Amount must be greater than zero.",
            );
        });


        it("rejects a negative amount", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.EXPENSE,
                        amount: -100,
                        date: "2026-08-25T10:00:00.000Z",
                        categoryId:
                        ctx.categories.shopping.id,
                        sourceAccountId:
                        ctx.accounts.bank.id,
                    },
                ),
            ).rejects.toThrow(
                "Amount must be greater than zero.",
            );
        });


        it("rejects an invalid date", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.EXPENSE,
                        amount: 100,
                        date: "not-a-date",
                        categoryId:
                        ctx.categories.shopping.id,
                        sourceAccountId:
                        ctx.accounts.bank.id,
                    },
                ),
            ).rejects.toThrow(
                "Invalid transaction date.",
            );
        });

    });


    describe("idempotency", () => {
        it("returns the existing transaction for the same idempotency key", async () => {
            const idempotencyKey = `create-expense-${randomUUID()}`;
            const ctx = await createTestContext();

            const input = {
                type: TransactionType.EXPENSE,
                amount: 500,
                date: "2026-08-25T10:00:00.000Z",
                merchant: "Amazon",
                categoryId: ctx.categories.shopping.id,
                sourceAccountId: ctx.accounts.bank.id,
                idempotencyKey,
            };

            const first = await createTransaction(
                ctx.user.id,
                input,
            );

            const second = await createTransaction(
                ctx.user.id,
                input,
            );

            // Same idempotency key must return the same transaction.
            expect(second.id).toBe(first.id);

            // Returned transaction must contain the same financial data.
            expect(Number(second.amount)).toBe(
                Number(first.amount),
            );

            // Exactly one transaction should exist for this idempotency key.
            const transactions = await prisma.transaction.findMany({
                where: {
                    userId: ctx.user.id,
                    idempotencyKey: input.idempotencyKey,
                },
            });

            expect(transactions).toHaveLength(1);
            expect(transactions[0].id).toBe(first.id);
        });
    });


    describe("merchant handling", () => {

        it("stores the merchant information", async () => {
            const ctx = await createTestContext();

            const transaction =
                await createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.EXPENSE,
                        amount: 500,
                        date: "2026-08-25T10:00:00.000Z",
                        merchant: "Amazon",
                        categoryId:
                        ctx.categories.shopping.id,
                        sourceAccountId:
                        ctx.accounts.bank.id,
                    },
                );

            expect(transaction.merchantId).toBe(
                ctx.merchants.amazon.id,
            );

            expect(transaction.merchantRaw).toBe(
                "Amazon",
            );

            expect(
                transaction.merchantNormalized,
            ).toBe("amazon");
        });


        it("learns a USER merchant mapping when a category is explicitly supplied", async () => {
            const ctx = await createTestContext();

            const transaction =
                await createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.EXPENSE,
                        amount: 500,
                        date: "2026-08-25T10:00:00.000Z",
                        merchant: "Amazon",
                        categoryId:
                        ctx.categories.shopping.id,
                        sourceAccountId:
                        ctx.accounts.bank.id,
                    },
                );

            expect(transaction.categoryId).toBe(
                ctx.categories.shopping.id,
            );

            const mapping =
                await prisma.merchantMapping.findUnique({
                    where: {
                        userId_merchantId: {
                            userId: ctx.user.id,
                            merchantId:
                            ctx.merchants.amazon.id,
                        },
                    },
                });

            expect(mapping).not.toBeNull();

            expect(mapping?.categoryId).toBe(
                ctx.categories.shopping.id,
            );

            expect(mapping?.source).toBe("USER");
        });

    });


    describe("notes and metadata", () => {

        it("stores a note", async () => {
            const ctx = await createTestContext();

            const transaction =
                await createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.EXPENSE,
                        amount: 500,
                        date: "2026-08-25T10:00:00.000Z",
                        merchant: "Amazon",
                        categoryId:
                        ctx.categories.shopping.id,
                        sourceAccountId:
                        ctx.accounts.bank.id,
                        note: "Office supplies",
                    },
                );

            expect(transaction.note).toBe(
                "Office supplies",
            );
        });


        it("stores the correct year and month", async () => {
            const ctx = await createTestContext();

            const transaction =
                await createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.EXPENSE,
                        amount: 500,
                        date: "2026-08-25T10:00:00.000Z",
                        categoryId:
                        ctx.categories.shopping.id,
                        sourceAccountId:
                        ctx.accounts.bank.id,
                    },
                );

            expect(transaction.year).toBe(2026);
            expect(transaction.month).toBe(8);
        });

    });

    describe("error messages", () => {
        it("rejects a zero amount with the correct error", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 0,
                    date: "2026-08-25T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                }),
            ).rejects.toThrow("Amount must be greater than zero.");
        });

        it("rejects a negative amount with the correct error", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: -100,
                    date: "2026-08-25T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                }),
            ).rejects.toThrow("Amount must be greater than zero.");
        });

        it("rejects a transfer to the same account with the correct error", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(ctx.user.id, {
                    type: TransactionType.TRANSFER,
                    amount: 1000,
                    date: "2026-08-25T10:00:00.000Z",
                    merchant: "Transfer",
                    sourceAccountId: ctx.accounts.bank.id,
                    destinationAccountId: ctx.accounts.bank.id,
                }),
            ).rejects.toThrow(
                "Cannot transfer to the same account.",
            );
        });

        it("rejects an invalid category with the correct error", async () => {
            const ctx = await createTestContext();

            await expect(
                createTransaction(ctx.user.id, {
                    type: TransactionType.EXPENSE,
                    amount: 500,
                    date: "2026-08-25T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: "00000000-0000-0000-0000-000000000000",
                    sourceAccountId: ctx.accounts.bank.id,
                }),
            ).rejects.toThrow();
        });
    });
    describe("credit card accounts", () => {
        it("creates an expense from a credit card", async () => {
            const ctx = await createTestContext();

            const transaction = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.EXPENSE,
                    amount: 1250,
                    date: "2026-08-25T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.creditCard.id,
                },
            );

            expect(transaction.sourceAccountId).toBe(
                ctx.accounts.creditCard.id,
            );

            const ledgerEntries =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId: transaction.id,
                    },
                });

            expect(ledgerEntries).toHaveLength(1);

            expect(ledgerEntries[0].financialAccountId).toBe(
                ctx.accounts.creditCard.id,
            );

            expect(Number(ledgerEntries[0].amount)).toBe(-1250);
        });

        it("creates an investment from a bank account, not a credit card", async () => {
            const ctx = await createTestContext();

            const transaction = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.INVESTMENT,
                    amount: 5000,
                    date: "2026-08-25T10:00:00.000Z",
                    merchant: "Mutual Fund",
                    categoryId: ctx.categories.investment.id,
                    sourceAccountId: ctx.accounts.bank.id,
                },
            );

            expect(transaction.sourceAccountId).toBe(
                ctx.accounts.bank.id,
            );

            const ledgerEntries =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId: transaction.id,
                    },
                });

            expect(ledgerEntries).toHaveLength(1);
            expect(Number(ledgerEntries[0].amount)).toBe(-5000);
        });
    });
});