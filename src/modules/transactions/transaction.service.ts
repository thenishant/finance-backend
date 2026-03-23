import {prisma} from "../../database/prisma";
import {Prisma} from "@prisma/client";

export const createTransaction = async (userId: string, data: any) => {
    return prisma.$transaction(async (tx) => {

        // ✅ 1. Idempotency check
        if (data.idempotencyKey) {
            const existing = await tx.transaction.findUnique({
                where: {idempotencyKey: data.idempotencyKey}
            });

            if (existing) return existing;
        }

        const amount = new Prisma.Decimal(data.amount);
        const date = new Date(data.date);

        // ✅ 2. Validate accounts
        const fromAccount = data.fromAccountId
            ? await tx.account.findFirst({
                where: {id: data.fromAccountId, userId}
            })
            : null;

        const toAccount = data.toAccountId
            ? await tx.account.findFirst({
                where: {id: data.toAccountId, userId}
            })
            : null;

        if (data.type === "EXPENSE" || data.type === "INVESTMENT") {
            if (!fromAccount) throw new Error("fromAccountId required");
        }

        if (data.type === "INCOME") {
            if (!toAccount) throw new Error("toAccountId required");
        }

        if (data.type === "TRANSFER") {
            if (!fromAccount || !toAccount)
                throw new Error("Both accounts required");

            if (fromAccount.id === toAccount.id)
                throw new Error("Cannot transfer to same account");
        }

        // ✅ 3. Create transaction
        const trx = await tx.transaction.create({
            data: {
                userId,
                type: data.type,
                amount,
                date,
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                categoryId: data.categoryId,
                fromAccountId: data.fromAccountId,
                toAccountId: data.toAccountId,
                paymentMethod: data.paymentMethod,
                note: data.note,
                idempotencyKey: data.idempotencyKey
            }
        });

        // ✅ 4. Build ledger entries
        const entries: any[] = [];

        if (data.type === "EXPENSE" || data.type === "INVESTMENT") {
            entries.push({
                userId,
                accountId: data.fromAccountId,
                transactionId: trx.id,
                amount: amount.negated()
            });
        }

        if (data.type === "INCOME") {
            entries.push({
                userId,
                accountId: data.toAccountId,
                transactionId: trx.id,
                amount: amount
            });
        }

        if (data.type === "TRANSFER") {
            entries.push(
                {
                    userId,
                    accountId: data.fromAccountId,
                    transactionId: trx.id,
                    amount: amount.negated()
                },
                {
                    userId,
                    accountId: data.toAccountId,
                    transactionId: trx.id,
                    amount: amount
                }
            );
        }

        // ✅ 5. Insert ledger
        await tx.ledgerEntry.createMany({data: entries});

        // ✅ 6. Update balances (cache)
        for (const entry of entries) {
            await tx.account.update({
                where: {id: entry.accountId},
                data: {
                    balance:
                        entry.amount.gt(0)
                            ? {increment: entry.amount}
                            : {decrement: entry.amount.abs()}
                }
            });
        }

        return trx;
    });
};

export const deleteTransaction = async (
    userId: string,
    transactionId: string
) => {
    return prisma.$transaction(async (tx) => {

        const trx = await tx.transaction.findFirst({
            where: {id: transactionId, userId, deletedAt: null}
        });

        if (!trx) throw new Error("Transaction not found");

        // ✅ Get ledger entries
        const entries = await tx.ledgerEntry.findMany({
            where: {transactionId}
        });

        // ✅ Reverse entries
        const reversed = entries.map(e => ({
            userId,
            accountId: e.accountId,
            transactionId: trx.id,
            amount: new Prisma.Decimal(e.amount).negated()
        }));

        // ✅ Insert reversal
        await tx.ledgerEntry.createMany({data: reversed});

        // ✅ Update balances
        for (const r of reversed) {
            await tx.account.update({
                where: {id: r.accountId},
                data: {
                    balance:
                        r.amount.gt(0)
                            ? {increment: r.amount}
                            : {decrement: r.amount.abs()}
                }
            });
        }

        // ✅ Soft delete transaction
        await tx.transaction.update({
            where: {id: transactionId},
            data: {deletedAt: new Date()}
        });
    });
};

export const restoreTransaction = async (
    userId: string,
    transactionId: string
) => {
    return prisma.$transaction(async (tx) => {

        const trx = await tx.transaction.findFirst({
            where: {id: transactionId, userId, deletedAt: {not: null}}
        });

        if (!trx) throw new Error("Transaction not found");

        const entries = await tx.ledgerEntry.findMany({
            where: {transactionId}
        });

        // Reverse reversal (apply again)
        const reapplied = entries.map(e => ({
            userId,
            accountId: e.accountId,
            transactionId: trx.id,
            amount: new Prisma.Decimal(e.amount)
        }));

        await tx.ledgerEntry.createMany({data: reapplied});

        for (const r of reapplied) {
            await tx.account.update({
                where: {id: r.accountId},
                data: {
                    balance:
                        r.amount.gt(0)
                            ? {increment: r.amount}
                            : {decrement: r.amount.abs()}
                }
            });
        }

        await tx.transaction.update({
            where: {id: transactionId},
            data: {deletedAt: null}
        });
    });
};

export const getTransactions = async (userId: string) => {
    return prisma.transaction.findMany({
        where: {
            userId,
            deletedAt: null
        },
        include: {
            category: true,
            fromAccount: true,
            toAccount: true
        },
        orderBy: {
            date: "desc"
        }
    });
};

export const rebuildAccountBalance = async (accountId: string) => {

    const entries = await prisma.ledgerEntry.findMany({
        where: {accountId}
    });

    const balance = entries.reduce(
        (acc, e) => acc.plus(e.amount),
        new Prisma.Decimal(0)
    );

    await prisma.account.update({
        where: {id: accountId},
        data: {balance}
    });
};

export const getAccountWithComputedBalance = async (accountId: string) => {

    const entries = await prisma.ledgerEntry.findMany({
        where: {accountId}
    });

    const computed = entries.reduce(
        (acc, e) => acc.plus(e.amount),
        new Prisma.Decimal(0)
    );

    const account = await prisma.account.findUnique({
        where: {id: accountId}
    });

    return {
        ...account,
        computedBalance: computed
    };
};