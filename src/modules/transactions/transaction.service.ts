import {prisma} from "../../database/prisma";
import {Prisma, TransactionType} from "@prisma/client";

/* =============================
   HELPERS
============================= */

const toDecimal = (v: any) => new Prisma.Decimal(v);

const serialize = (obj: any) =>
    JSON.parse(
        JSON.stringify(obj, (_, v) =>
            v instanceof Prisma.Decimal ? v.toString() : v
        )
    );

const applyBalance = async (
    tx: Prisma.TransactionClient,
    accountId: string,
    amount: Prisma.Decimal
) => {
    return tx.account.update({
        where: {id: accountId},
        data: {
            balance: amount.gt(0)
                ? {increment: amount}
                : {decrement: amount.abs()}
        }
    });
};

/* =============================
   ANALYTICS HELPER (FIXED)
============================= */

const updateMonthlyAnalytics = async (
    tx: Prisma.TransactionClient,
    userId: string,
    year: number,
    month: number,
    type: TransactionType,
    amount: Prisma.Decimal,
    operation: "increment" | "decrement"
) => {

    // ✅ Ignore transfer completely
    if (type === "TRANSFER") return;

    const getValue = (match: TransactionType) =>
        type === match ? {[operation]: amount} : undefined;

    await tx.monthlyAnalytics.upsert({
        where: {
            userId_year_month: {userId, year, month}
        },
        update: {
            totalIncome: getValue("INCOME"),
            totalExpense: getValue("EXPENSE"),
            totalInvestment: getValue("INVESTMENT"),
        },
        create: {
            userId,
            year,
            month,
            totalIncome:
                type === "INCOME" ? amount : new Prisma.Decimal(0),
            totalExpense:
                type === "EXPENSE" ? amount : new Prisma.Decimal(0),
            totalInvestment:
                type === "INVESTMENT" ? amount : new Prisma.Decimal(0),
        }
    });
};

/* =============================
   CREATE TRANSACTION
============================= */

export const createTransaction = async (
    userId: string,
    data: {
        type: TransactionType;
        amount: number;
        date: string;
        categoryId?: string;
        fromAccountId?: string;
        toAccountId?: string;
        paymentMethod: string;
        note?: string;
        idempotencyKey?: string;
    }
) => {
    return prisma.$transaction(async (tx) => {

        const {type} = data;
        if (!type) throw new Error("Transaction type is required");

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

        if (isNaN(date.getTime())) {
            throw new Error("Invalid date");
        }

        const year = date.getFullYear();
        const month = date.getMonth() + 1;

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

        if (type === "INCOME") {
            if (!toAccount) throw new Error("Invalid toAccountId");
        }

        if (type === "EXPENSE" || type === "INVESTMENT") {
            if (!fromAccount) throw new Error("Invalid fromAccountId");
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
                year,
                month,
                categoryId,
                fromAccountId: data.fromAccountId ?? null,
                toAccountId: data.toAccountId ?? null,
                paymentMethod: data.paymentMethod as any,
                note: data.note ?? null,
                idempotencyKey: data.idempotencyKey ?? null
            }
        });

        /* ---------- LEDGER ENTRIES ---------- */

        const entries: Prisma.LedgerEntryCreateManyInput[] = [];

        const push = (accountId: string, amt: Prisma.Decimal) => {
            entries.push({
                userId,
                accountId,
                transactionId: trx.id,
                amount: amt
            });
        };

        if (type === "EXPENSE" || type === "INVESTMENT") {
            push(fromAccount!.id, amount.negated());
        }

        if (type === "INCOME") {
            push(toAccount!.id, amount);
        }

        if (type === "TRANSFER") {
            push(fromAccount!.id, amount.negated());
            push(toAccount!.id, amount);
        }

        await tx.ledgerEntry.createMany({data: entries});

        /* ---------- UPDATE BALANCES ---------- */

        for (const entry of entries) {
            await applyBalance(tx, entry.accountId, toDecimal(entry.amount));
        }

        /* ---------- UPDATE ANALYTICS (FIXED POSITION) ---------- */

        await updateMonthlyAnalytics(
            tx,
            userId,
            year,
            month,
            type,
            amount,
            "increment"
        );

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

        /* ---------- ANALYTICS ---------- */

        await updateMonthlyAnalytics(
            tx,
            userId,
            trx.year,
            trx.month,
            trx.type,
            toDecimal(trx.amount),
            "decrement"
        );

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

        /* ---------- ANALYTICS ---------- */

        await updateMonthlyAnalytics(
            tx,
            userId,
            trx.year,
            trx.month,
            trx.type,
            toDecimal(trx.amount),
            "increment"
        );

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