import {prisma} from "../../database/prisma";
import {Prisma} from "@prisma/client";

/* =============================
   HELPERS
============================= */

const toDecimal = (value: any): Prisma.Decimal =>
    value instanceof Prisma.Decimal
        ? value
        : new Prisma.Decimal(value);

const serialize = (obj: any) =>
    JSON.parse(
        JSON.stringify(obj, (_, v) =>
            v instanceof Prisma.Decimal ? v.toString() : v
        )
    );

const applyBalance = async (
    tx: any,
    accountId: string,
    amount: any
) => {
    const amt = toDecimal(amount);

    return tx.account.update({
        where: {id: accountId},
        data: {
            balance: amt.gt(0)
                ? {increment: amt}
                : {decrement: amt.abs()}
        }
    });
};

/* =============================
   CREATE TRANSACTION
============================= */

export const createTransaction = async (userId: string, data: any) => {
    return prisma.$transaction(async (tx) => {

        /* ---------- VALIDATION ---------- */

        if (!data.type) {
            throw new Error("Transaction type is required");
        }

        const type = data.type;

        /* ---------- IDEMPOTENCY ---------- */

        if (data.idempotencyKey) {
            const existing = await tx.transaction.findUnique({
                where: {idempotencyKey: data.idempotencyKey}
            });

            if (existing) return serialize(existing);
        }

        /* ---------- NORMALIZE ---------- */

        const amount = toDecimal(data.amount);
        const date = new Date(data.date);

        /* ---------- FETCH ACCOUNTS ---------- */

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

        /* ---------- BUSINESS RULES ---------- */

        if (["EXPENSE", "INVESTMENT"].includes(type) && !fromAccount) {
            throw new Error("fromAccountId required");
        }

        if (type === "INCOME" && !toAccount) {
            throw new Error("toAccountId required");
        }

        if (type === "TRANSFER") {
            if (!fromAccount || !toAccount) {
                throw new Error("Both accounts required");
            }

            if (fromAccount.id === toAccount.id) {
                throw new Error("Cannot transfer to same account");
            }
        }

        /* ---------- CATEGORY ---------- */

        const categoryId =
            type === "TRANSFER" ? null : data.categoryId;

        if (type !== "TRANSFER" && !categoryId) {
            throw new Error("categoryId required");
        }

        /* ---------- CREATE TRANSACTION ---------- */

        const trx = await tx.transaction.create({
            data: {
                userId,
                type,
                amount,
                date,
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                categoryId,
                fromAccountId: data.fromAccountId ?? null,
                toAccountId: data.toAccountId ?? null,
                paymentMethod: data.paymentMethod,
                note: data.note ?? null,
                idempotencyKey: data.idempotencyKey ?? null
            }
        });

        /* ---------- LEDGER ENTRIES ---------- */

        const entries: Prisma.LedgerEntryCreateManyInput[] = [];

        const pushEntry = (accountId: string, amt: Prisma.Decimal) => {
            entries.push({
                userId,
                accountId,
                transactionId: trx.id,
                amount: amt
            });
        };

        if (["EXPENSE", "INVESTMENT"].includes(type)) {
            pushEntry(fromAccount!.id, amount.negated());
        }

        if (type === "INCOME") {
            pushEntry(toAccount!.id, amount);
        }

        if (type === "TRANSFER") {
            pushEntry(fromAccount!.id, amount.negated());
            pushEntry(toAccount!.id, amount);
        }

        await tx.ledgerEntry.createMany({data: entries});

        /* ---------- UPDATE BALANCES ---------- */

        for (const e of entries) {
            await applyBalance(tx, e.accountId, e.amount);
        }

        return serialize(trx);
    });
};

/* =============================
   DELETE TRANSACTION
============================= */

export const deleteTransaction = async (
    userId: string,
    transactionId: string
) => {
    return prisma.$transaction(async (tx) => {

        const trx = await tx.transaction.findFirst({
            where: {id: transactionId, userId, deletedAt: null}
        });

        if (!trx) throw new Error("Transaction not found");

        const entries = await tx.ledgerEntry.findMany({
            where: {transactionId}
        });

        const reversed = entries.map(e => ({
            userId,
            accountId: e.accountId,
            transactionId: trx.id,
            amount: toDecimal(e.amount).negated()
        }));

        await tx.ledgerEntry.createMany({data: reversed});

        for (const r of reversed) {
            await applyBalance(tx, r.accountId, r.amount);
        }

        await tx.transaction.update({
            where: {id: transactionId},
            data: {deletedAt: new Date()}
        });
    });
};

/* =============================
   RESTORE TRANSACTION
============================= */

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

        const reapplied = entries.map(e => ({
            userId,
            accountId: e.accountId,
            transactionId: trx.id,
            amount: toDecimal(e.amount)
        }));

        await tx.ledgerEntry.createMany({data: reapplied});

        for (const r of reapplied) {
            await applyBalance(tx, r.accountId, r.amount);
        }

        await tx.transaction.update({
            where: {id: transactionId},
            data: {deletedAt: null}
        });
    });
};

/* =============================
   GET TRANSACTIONS
============================= */

export const getTransactions = async (userId: string) => {
    const trx = await prisma.transaction.findMany({
        where: {userId, deletedAt: null},
        include: {
            category: true,
            fromAccount: true,
            toAccount: true
        },
        orderBy: {date: "desc"}
    });

    return serialize(trx);
};

/* =============================
   REBUILD BALANCE
============================= */

export const rebuildAccountBalance = async (accountId: string) => {

    const entries = await prisma.ledgerEntry.findMany({
        where: {accountId}
    });

    const balance = entries.reduce(
        (acc, e) => acc.plus(toDecimal(e.amount)),
        new Prisma.Decimal(0)
    );

    await prisma.account.update({
        where: {id: accountId},
        data: {balance}
    });
};

/* =============================
   COMPUTED BALANCE
============================= */

export const getAccountWithComputedBalance = async (accountId: string) => {

    const entries = await prisma.ledgerEntry.findMany({
        where: {accountId}
    });

    const computed = entries.reduce(
        (acc, e) => acc.plus(toDecimal(e.amount)),
        new Prisma.Decimal(0)
    );

    const account = await prisma.account.findUnique({
        where: {id: accountId}
    });

    return serialize({
        ...account,
        computedBalance: computed
    });
};