import {PrismaClient, TransactionType} from "@prisma/client";
import {createTransaction, deleteTransaction, restoreTransaction, updateTransaction,} from "./transaction.service";
import {describe, it, expect, beforeEach, afterEach,} from "vitest";

const prisma = new PrismaClient();

describe("transaction.service", () => {
    let userId: string;
    let categoryId: string;
    let bank1Id: string;
    let bank2Id: string;

    beforeEach(async () => {
        const user = await prisma.user.create({
            data: {
                email: `test-${Date.now()}@test.com`,
            },
        });

        userId = user.id;

        const category =
            await prisma.category.create({
                data: {
                    userId,
                    name: "Food",
                    type: TransactionType.EXPENSE,
                },
            });

        categoryId = category.id;

        const bank1 =
            await prisma.financialAccount.create({
                data: {
                    userId,
                    name: "HDFC",
                    last4: "1234",
                    type: "BANK_ACCOUNT",
                },
            });

        const bank2 =
            await prisma.financialAccount.create({
                data: {
                    userId,
                    name: "ICICI",
                    last4: "4321",
                    type: "BANK_ACCOUNT",
                },
            });

        bank1Id = bank1.id;
        bank2Id = bank2.id;

        await prisma.ledgerEntry.create({
            data: {
                userId,
                financialAccountId: bank1Id,
                amount: 10000,
            },
        });
    });

    afterEach(async () => {
        await prisma.ledgerEntry.deleteMany();
        await prisma.transaction.deleteMany();
        await prisma.category.deleteMany();
        await prisma.financialAccount.deleteMany();
        await prisma.user.deleteMany();
    });

    it("creates expense ledger entry", async () => {
        const trx =
            await createTransaction(userId, {
                type: TransactionType.EXPENSE,
                amount: 1000,
                date: new Date().toISOString(),
                categoryId,
                sourceAccountId: bank1Id,
                note: "creates expense ledger entry"
            });

        const ledger =
            await prisma.ledgerEntry.findMany({
                where: {
                    transactionId: trx.id,
                },
            });

        expect(ledger).toHaveLength(1);
        expect(Number(ledger[0].amount)).toBe(-1000);
    });

    it("creates income ledger entry", async () => {
        const category =
            await prisma.category.create({
                data: {
                    userId,
                    name: "Salary",
                    type: TransactionType.INCOME,
                },
            });

        const trx =
            await createTransaction(userId, {
                type: TransactionType.INCOME,
                amount: 5000,
                date: new Date().toISOString(),
                categoryId: category.id,
                destinationAccountId: bank1Id,
            });

        const ledger =
            await prisma.ledgerEntry.findMany({
                where: {
                    transactionId: trx.id,
                },
            });

        expect(ledger).toHaveLength(1);
        expect(Number(ledger[0].amount)).toBe(5000);
    });

    it("creates two ledger entries for transfer", async () => {
        const trx =
            await createTransaction(userId, {
                type: TransactionType.TRANSFER,
                amount: 2000,
                date: new Date().toISOString(),
                sourceAccountId: bank1Id,
                destinationAccountId: bank2Id,
            });

        const ledger =
            await prisma.ledgerEntry.findMany({
                where: {
                    transactionId: trx.id,
                },
                orderBy: {
                    amount: "asc",
                },
            });

        expect(ledger).toHaveLength(2);
        expect(Number(ledger[0].amount)).toBe(-2000);
        expect(Number(ledger[1].amount)).toBe(2000);
    });

    it("rejects transfer to same account", async () => {
        await expect(
            createTransaction(userId, {
                type: TransactionType.TRANSFER,
                amount: 1000,
                date: new Date().toISOString(),
                sourceAccountId: bank1Id,
                destinationAccountId: bank1Id,
            })
        ).rejects.toThrow("Cannot transfer to same account");
    });

    it("rejects expense without category", async () => {
        await expect(
            createTransaction(userId, {
                type: TransactionType.EXPENSE,
                amount: 100,
                date: new Date().toISOString(),
                sourceAccountId: bank1Id,
            })).rejects.toThrow("categoryId required");
    });

    it("deletes ledger entries when transaction is deleted", async () => {
        const trx =
            await createTransaction(userId, {
                type: TransactionType.EXPENSE,
                amount: 1000,
                date: new Date().toISOString(),
                categoryId,
                sourceAccountId: bank1Id,
            });

        await deleteTransaction(
            userId,
            trx.id
        );

        const ledger =
            await prisma.ledgerEntry.findMany({
                where: {
                    transactionId: trx.id,
                },
            });

        expect(ledger).toHaveLength(0);
    });

    it("recreates ledger entries when restored", async () => {
        const trx =
            await createTransaction(userId, {
                type: TransactionType.EXPENSE,
                amount: 1000,
                date: new Date().toISOString(),
                categoryId,
                sourceAccountId: bank1Id,
            });

        await deleteTransaction(
            userId,
            trx.id
        );

        await restoreTransaction(
            userId,
            trx.id
        );

        const ledger =
            await prisma.ledgerEntry.findMany({
                where: {
                    transactionId: trx.id,
                },
            });

        expect(ledger).toHaveLength(1);
        expect(Number(ledger[0].amount)).toBe(-1000);
    });

    it("maintains correct account balance", async () => {
        await createTransaction(userId, {
            type: TransactionType.EXPENSE,
            amount: 1000,
            date: new Date().toISOString(),
            categoryId,
            sourceAccountId: bank1Id,
        });

        await createTransaction(userId, {
            type: TransactionType.INCOME,
            amount: 5000,
            date: new Date().toISOString(),
            categoryId: (
                await prisma.category.create({
                    data: {
                        userId,
                        name: "Salary",
                        type: TransactionType.INCOME,
                    },
                })
            ).id,
            destinationAccountId: bank1Id,
        });

        const result =
            await prisma.ledgerEntry.aggregate({
                where: {
                    financialAccountId:
                    bank1Id,
                },
                _sum: {
                    amount: true,
                },
            });

        expect(Number(result._sum.amount)).toBe(14000);
    });

    it("updates expense amount and rebuilds ledger", async () => {
        const trx = await createTransaction(userId, {
            type: TransactionType.EXPENSE,
            amount: 1000,
            date: new Date().toISOString(),
            categoryId,
            sourceAccountId: bank1Id,
        });

        await updateTransaction(userId, trx.id, {
            type: TransactionType.EXPENSE,
            amount: 1500,
            date: new Date().toISOString(),
            categoryId,
            sourceAccountId: bank1Id,
        });

        const ledger = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: trx.id,
            },
        });

        expect(ledger).toHaveLength(1);
        expect(Number(ledger[0].amount)).toBe(-1500);
    });

    it("converts expense to income", async () => {

        const incomeCategory =
            await prisma.category.create({
                data: {
                    userId,
                    name: "Salary",
                    type: TransactionType.INCOME,
                },
            });

        const trx = await createTransaction(userId, {
            type: TransactionType.EXPENSE,
            amount: 1000,
            date: new Date().toISOString(),
            categoryId,
            sourceAccountId: bank1Id,
        });

        await updateTransaction(userId, trx.id, {
            type: TransactionType.INCOME,
            amount: 1000,
            date: new Date().toISOString(),
            categoryId: incomeCategory.id,
            destinationAccountId: bank1Id,
        });

        const ledger = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: trx.id,
            },
        });

        expect(ledger).toHaveLength(1);
        expect(Number(ledger[0].amount)).toBe(1000);
    });

    it("converts expense to transfer", async () => {

        const trx = await createTransaction(userId, {
            type: TransactionType.EXPENSE,
            amount: 1000,
            date: new Date().toISOString(),
            categoryId,
            sourceAccountId: bank1Id,
        });

        await updateTransaction(userId, trx.id, {
            type: TransactionType.TRANSFER,
            amount: 1000,
            date: new Date().toISOString(),
            sourceAccountId: bank1Id,
            destinationAccountId: bank2Id,
        });

        const ledger = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: trx.id,
            },
        });

        expect(ledger).toHaveLength(2);
    });

    it("converts transfer to expense", async () => {

        const trx = await createTransaction(userId, {
            type: TransactionType.TRANSFER,
            amount: 1000,
            date: new Date().toISOString(),
            sourceAccountId: bank1Id,
            destinationAccountId: bank2Id,
        });

        await updateTransaction(userId, trx.id, {
            type: TransactionType.EXPENSE,
            amount: 1000,
            date: new Date().toISOString(),
            categoryId,
            sourceAccountId: bank1Id,
        });

        const ledger = await prisma.ledgerEntry.findMany({
            where: {
                transactionId: trx.id,
            },
        });

        expect(ledger).toHaveLength(1);
        expect(Number(ledger[0].amount)).toBe(-1000);
    });

    it("moves expense to another account", async () => {

        const trx = await createTransaction(userId, {
            type: TransactionType.EXPENSE,
            amount: 1000,
            date: new Date().toISOString(),
            categoryId,
            sourceAccountId: bank1Id,
        });

        await updateTransaction(userId, trx.id, {
            type: TransactionType.EXPENSE,
            amount: 1000,
            date: new Date().toISOString(),
            categoryId,
            sourceAccountId: bank2Id,
        });

        const bank1 =
            await prisma.ledgerEntry.aggregate({
                where: {
                    financialAccountId: bank1Id,
                },
                _sum: {
                    amount: true,
                },
            });

        const bank2 =
            await prisma.ledgerEntry.aggregate({
                where: {
                    financialAccountId: bank2Id,
                },
                _sum: {
                    amount: true,
                },
            });

        expect(Number(bank1._sum.amount)).toBe(10000);
        expect(Number(bank2._sum.amount)).toBe(-1000);
    });

    it("rejects transfer to same account during update", async () => {

        const trx = await createTransaction(userId, {
            type: TransactionType.EXPENSE,
            amount: 1000,
            date: new Date().toISOString(),
            categoryId,
            sourceAccountId: bank1Id,
        });

        await expect(
            updateTransaction(userId, trx.id, {
                type: TransactionType.TRANSFER,
                amount: 1000,
                date: new Date().toISOString(),
                sourceAccountId: bank1Id,
                destinationAccountId: bank1Id,
            })
        ).rejects.toThrow(
            "Cannot transfer to same account"
        );
    });
});