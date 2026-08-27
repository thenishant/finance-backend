import {describe, expect, it} from "vitest";
import {FinancialAccountType, TransactionType} from "@prisma/client";


import {prisma} from "../../database/prisma";

import {createUser} from "../helpers/factory";
import {createTestContext} from "../helpers/context";
import {
    createTransaction,
    deleteTransaction,
    getTransactionById,
    getTransactions,
    restoreTransaction
} from "../../modules/transactions/transaction.service";


describe("Delete / Restore Transaction", () => {
    describe("ledger isolation", () => {
        it("deleting one transaction does not remove another transaction's ledger entries", async () => {
            const ctx = await createTestContext();

            const first = await createTransaction(
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

            const second = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.EXPENSE,
                    amount: 750,
                    date: "2026-08-26T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                },
            );

            expect(
                await prisma.ledgerEntry.count({
                    where: {
                        transactionId: first.id,
                    },
                }),
            ).toBe(1);

            expect(
                await prisma.ledgerEntry.count({
                    where: {
                        transactionId: second.id,
                    },
                }),
            ).toBe(1);

            await deleteTransaction(
                ctx.user.id,
                first.id,
            );

            expect(
                await prisma.ledgerEntry.count({
                    where: {
                        transactionId: first.id,
                    },
                }),
            ).toBe(0);

            const secondEntries =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId: second.id,
                    },
                });

            expect(secondEntries).toHaveLength(1);
            expect(secondEntries[0].financialAccountId).toBe(
                ctx.accounts.bank.id,
            );
            expect(Number(secondEntries[0].amount)).toBe(-750);
        });

        it("restoring one transaction does not create ledger entries for another transaction", async () => {
            const ctx = await createTestContext();

            const first = await createTransaction(
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

            const second = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.EXPENSE,
                    amount: 750,
                    date: "2026-08-26T10:00:00.000Z",
                    merchant: "Amazon",
                    categoryId: ctx.categories.shopping.id,
                    sourceAccountId: ctx.accounts.bank.id,
                },
            );

            await deleteTransaction(
                ctx.user.id,
                first.id,
            );

            await restoreTransaction(
                ctx.user.id,
                first.id,
            );

            const firstEntries =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId: first.id,
                    },
                });

            const secondEntries =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId: second.id,
                    },
                });

            expect(firstEntries).toHaveLength(1);
            expect(secondEntries).toHaveLength(1);

            expect(Number(firstEntries[0].amount)).toBe(-500);
            expect(Number(secondEntries[0].amount)).toBe(-750);
        });
    });

    describe("Delete Transaction", () => {
        it("does not change a deleted transaction when delete is attempted again", async () => {
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

            const before = await prisma.transaction.findUnique({
                where: {
                    id: transaction.id,
                },
            });

            await expect(
                deleteTransaction(
                    ctx.user.id,
                    transaction.id,
                ),
            ).rejects.toThrow();

            const after = await prisma.transaction.findUnique({
                where: {
                    id: transaction.id,
                },
            });

            expect(after?.deletedAt).toEqual(before?.deletedAt);

            const ledgerEntries = await prisma.ledgerEntry.findMany({
                where: {
                    transactionId: transaction.id,
                },
            });

            expect(ledgerEntries).toHaveLength(0);
        });

        it("restores the original expense ledger entry exactly", async () => {
            const ctx = await createTestContext();

            const transaction = await createTransaction(
                ctx.user.id,
                {
                    type: TransactionType.EXPENSE,
                    amount: 750,
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

            expect(
                await prisma.ledgerEntry.count({
                    where: {
                        transactionId: transaction.id,
                    },
                }),
            ).toBe(0);

            await restoreTransaction(
                ctx.user.id,
                transaction.id,
            );

            const ledgerEntries = await prisma.ledgerEntry.findMany({
                where: {
                    transactionId: transaction.id,
                },
            });

            expect(ledgerEntries).toHaveLength(1);
            expect(ledgerEntries[0].financialAccountId).toBe(
                ctx.accounts.bank.id,
            );
            expect(Number(ledgerEntries[0].amount)).toBe(-750);
        });

        it("supports delete → restore → delete again", async () => {
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

            await restoreTransaction(
                ctx.user.id,
                transaction.id,
            );

            let restored = await prisma.transaction.findUnique({
                where: {
                    id: transaction.id,
                },
            });

            expect(restored?.deletedAt).toBeNull();

            expect(
                await prisma.ledgerEntry.count({
                    where: {
                        transactionId: transaction.id,
                    },
                }),
            ).toBe(1);

            await deleteTransaction(
                ctx.user.id,
                transaction.id,
            );

            const deletedAgain = await prisma.transaction.findUnique({
                where: {
                    id: transaction.id,
                },
            });

            expect(deletedAgain?.deletedAt).not.toBeNull();

            expect(
                await prisma.ledgerEntry.count({
                    where: {
                        transactionId: transaction.id,
                    },
                }),
            ).toBe(0);
        });

        it("deletes an existing transaction", async () => {
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

            const deleted =
                await deleteTransaction(
                    ctx.user.id,
                    transaction.id,
                );

            expect(deleted.id).toBe(
                transaction.id,
            );

            expect(deleted.deletedAt).not.toBeNull();
        });

        it("sets deletedAt when deleting a transaction", async () => {
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

            await deleteTransaction(
                ctx.user.id,
                transaction.id,
            );

            const stored =
                await prisma.transaction.findUnique({
                    where: {
                        id: transaction.id,
                    },
                });

            expect(stored).not.toBeNull();
            expect(stored?.deletedAt).not.toBeNull();
        });

        it("removes ledger entries when deleting a transaction", async () => {
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

            const before =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId:
                        transaction.id,
                    },
                });

            expect(before).toHaveLength(1);

            await deleteTransaction(
                ctx.user.id,
                transaction.id,
            );

            const after =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId:
                        transaction.id,
                    },
                });

            expect(after).toHaveLength(0);
        });

        it("no longer returns a deleted transaction from getTransactions", async () => {
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

            await deleteTransaction(
                ctx.user.id,
                transaction.id,
            );

            const transactions =
                await getTransactions(
                    ctx.user.id,
                );

            expect(
                transactions.some(
                    item =>
                        item.id === transaction.id,
                ),
            ).toBe(false);
        });

        it("no longer returns a deleted transaction from getTransactionById", async () => {
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

            await deleteTransaction(
                ctx.user.id,
                transaction.id,
            );

            await expect(
                getTransactionById(
                    ctx.user.id,
                    transaction.id,
                ),
            ).rejects.toThrow(
                "Transaction not found",
            );
        });

        it("cannot delete a non-existent transaction", async () => {
            const ctx = await createTestContext();

            await expect(
                deleteTransaction(
                    ctx.user.id,
                    "00000000-0000-0000-0000-000000000000",
                ),
            ).rejects.toThrow(
                "Transaction not found.",
            );
        });

        it("cannot delete another user's transaction", async () => {
            const ctx = await createTestContext();

            const otherUser = await createUser();

            const otherAccount =
                await prisma.financialAccount.create({
                    data: {
                        userId: otherUser.id,
                        name: "Other Bank",
                        type: FinancialAccountType.BANK_ACCOUNT,
                        last4: "1234",
                    },
                });

            const otherCategory =
                await prisma.category.create({
                    data: {
                        userId: otherUser.id,
                        name: "Other Shopping",
                        type: TransactionType.EXPENSE,
                    },
                });

            const transaction =
                await createTransaction(
                    otherUser.id,
                    {
                        type: TransactionType.EXPENSE,
                        amount: 500,
                        date: "2026-08-25T10:00:00.000Z",
                        categoryId:
                        otherCategory.id,
                        sourceAccountId:
                        otherAccount.id,
                    },
                );

            await expect(
                deleteTransaction(
                    ctx.user.id,
                    transaction.id,
                ),
            ).rejects.toThrow(
                "Transaction not found.",
            );

            const stored =
                await prisma.transaction.findUnique({
                    where: {
                        id: transaction.id,
                    },
                });

            expect(stored?.deletedAt).toBeNull();
        });

    });

    describe("Restore Transaction", () => {
        it("restores a deleted transaction", async () => {
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

            await deleteTransaction(
                ctx.user.id,
                transaction.id,
            );

            const restored =
                await restoreTransaction(
                    ctx.user.id,
                    transaction.id,
                );

            expect(restored.id).toBe(
                transaction.id,
            );

            expect(restored.deletedAt).toBeNull();
        });

        it("clears deletedAt when restoring", async () => {
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

            await deleteTransaction(
                ctx.user.id,
                transaction.id,
            );

            await restoreTransaction(
                ctx.user.id,
                transaction.id,
            );

            const stored =
                await prisma.transaction.findUnique({
                    where: {
                        id: transaction.id,
                    },
                });

            expect(stored?.deletedAt).toBeNull();
        });

        it("recreates ledger entries when restoring", async () => {
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

            await deleteTransaction(
                ctx.user.id,
                transaction.id,
            );

            const deletedEntries =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId:
                        transaction.id,
                    },
                });

            expect(deletedEntries).toHaveLength(0);

            await restoreTransaction(
                ctx.user.id,
                transaction.id,
            );

            const restoredEntries =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId:
                        transaction.id,
                    },
                });

            expect(restoredEntries).toHaveLength(1);

            expect(
                restoredEntries[0].financialAccountId,
            ).toBe(ctx.accounts.bank.id);

            expect(
                Number(restoredEntries[0].amount),
            ).toBe(-500);
        });


        it("restored transaction appears in getTransactions", async () => {
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

            await deleteTransaction(
                ctx.user.id,
                transaction.id,
            );

            await restoreTransaction(
                ctx.user.id,
                transaction.id,
            );

            const transactions =
                await getTransactions(
                    ctx.user.id,
                );

            expect(
                transactions.some(
                    item =>
                        item.id === transaction.id,
                ),
            ).toBe(true);
        });


        it("restored transaction is returned by getTransactionById", async () => {
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

            await deleteTransaction(
                ctx.user.id,
                transaction.id,
            );

            await restoreTransaction(
                ctx.user.id,
                transaction.id,
            );

            const restored =
                await getTransactionById(
                    ctx.user.id,
                    transaction.id,
                );

            expect(restored.id).toBe(
                transaction.id,
            );

            expect(restored.deletedAt).toBeNull();
        });


        it("cannot restore an active transaction", async () => {
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

            await expect(
                restoreTransaction(
                    ctx.user.id,
                    transaction.id,
                ),
            ).rejects.toThrow(
                "Transaction not found.",
            );
        });


        it("cannot restore another user's transaction", async () => {
            const ctx = await createTestContext();

            const otherUser = await createUser();

            const otherAccount =
                await prisma.financialAccount.create({
                    data: {
                        userId: otherUser.id,
                        name: "Other Bank",
                        type: FinancialAccountType.BANK_ACCOUNT,
                        last4: "1234",
                    },
                });

            const otherCategory =
                await prisma.category.create({
                    data: {
                        userId: otherUser.id,
                        name: "Other Shopping",
                        type: TransactionType.EXPENSE,
                    },
                });

            const transaction =
                await createTransaction(
                    otherUser.id,
                    {
                        type: TransactionType.EXPENSE,
                        amount: 500,
                        date: "2026-08-25T10:00:00.000Z",
                        categoryId:
                        otherCategory.id,
                        sourceAccountId:
                        otherAccount.id,
                    },
                );

            await deleteTransaction(
                otherUser.id,
                transaction.id,
            );

            await expect(
                restoreTransaction(
                    ctx.user.id,
                    transaction.id,
                ),
            ).rejects.toThrow(
                "Transaction not found.",
            );

            const stored =
                await prisma.transaction.findUnique({
                    where: {
                        id: transaction.id,
                    },
                });

            expect(stored?.deletedAt).not.toBeNull();
        });

    });


    describe("Delete → Restore lifecycle", () => {

        it("preserves the transaction data through delete and restore", async () => {
            const ctx = await createTestContext();

            const transaction =
                await createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.EXPENSE,
                        amount: 1250,
                        date: "2026-08-25T10:00:00.000Z",
                        merchant: "Amazon",
                        categoryId:
                        ctx.categories.shopping.id,
                        sourceAccountId:
                        ctx.accounts.bank.id,
                        note: "Office supplies",
                    },
                );

            await deleteTransaction(
                ctx.user.id,
                transaction.id,
            );

            const restored =
                await restoreTransaction(
                    ctx.user.id,
                    transaction.id,
                );

            expect(restored.id).toBe(
                transaction.id,
            );

            expect(restored.type).toBe(
                transaction.type,
            );

            expect(
                Number(restored.amount),
            ).toBe(
                Number(transaction.amount),
            );

            expect(restored.merchantId).toBe(
                transaction.merchantId,
            );

            expect(restored.merchantRaw).toBe(
                transaction.merchantRaw,
            );

            expect(restored.categoryId).toBe(
                transaction.categoryId,
            );

            expect(restored.sourceAccountId).toBe(
                transaction.sourceAccountId,
            );

            expect(restored.destinationAccountId).toBe(
                transaction.destinationAccountId,
            );

            expect(restored.note).toBe(
                transaction.note,
            );

            expect(restored.deletedAt).toBeNull();
        });


        it("restores an income transaction with a positive ledger entry", async () => {
            const ctx = await createTestContext();

            const transaction =
                await createTransaction(
                    ctx.user.id,
                    {
                        type: TransactionType.INCOME,
                        amount: 10000,
                        date: "2026-08-25T10:00:00.000Z",
                        categoryId:
                        ctx.categories.salary.id,
                        destinationAccountId:
                        ctx.accounts.bank.id,
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

            const entries =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId:
                        transaction.id,
                    },
                });

            expect(entries).toHaveLength(1);

            expect(
                entries[0].financialAccountId,
            ).toBe(ctx.accounts.bank.id);

            expect(
                Number(entries[0].amount),
            ).toBe(10000);
        });


        it("restores a transfer with both ledger entries", async () => {
            const ctx = await createTestContext();

            const transaction =
                await createTransaction(
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

            await deleteTransaction(
                ctx.user.id,
                transaction.id,
            );

            await restoreTransaction(
                ctx.user.id,
                transaction.id,
            );

            const entries =
                await prisma.ledgerEntry.findMany({
                    where: {
                        transactionId:
                        transaction.id,
                    },
                    orderBy: {
                        amount: "asc",
                    },
                });

            expect(entries).toHaveLength(2);

            expect(
                entries.map(entry =>
                    Number(entry.amount),
                ),
            ).toEqual([
                -2500,
                2500,
            ]);

            expect(
                entries.map(
                    entry =>
                        entry.financialAccountId,
                ),
            ).toEqual([
                ctx.accounts.bank.id,
                ctx.accounts.investment.id,
            ]);
        });

    });

});