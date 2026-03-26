import {prisma} from "../../database/prisma";
import {Prisma, TransactionType} from "@prisma/client";

/* =============================
   SIMPLE SERIALIZER
============================= */

const serialize = (obj: any) =>
    JSON.parse(
        JSON.stringify(obj, (_, v) =>
            v instanceof Prisma.Decimal ? v.toString() : v
        )
    );

/* =============================
   ANALYTICS (FIXED & SIMPLE)
============================= */

const updateAnalytics = async (
    tx: Prisma.TransactionClient,
    userId: string,
    year: number,
    month: number,
    type: TransactionType,
    amount: Prisma.Decimal,
    op: "increment" | "decrement"
) => {
    if (type === "TRANSFER") return;

    const updateData: any = {};

    if (type === "INCOME") {
        updateData.totalIncome = {[op]: amount};
    } else if (type === "EXPENSE") {
        updateData.totalExpense = {[op]: amount};
    } else if (type === "INVESTMENT") {
        updateData.totalInvestment = {[op]: amount};
    }

    await tx.monthlyAnalytics.upsert({
        where: {userId_year_month: {userId, year, month}},
        update: updateData,
        create: {
            userId,
            year,
            month,
            totalIncome: type === "INCOME" ? amount : new Prisma.Decimal(0),
            totalExpense: type === "EXPENSE" ? amount : new Prisma.Decimal(0),
            totalInvestment: type === "INVESTMENT" ? amount : new Prisma.Decimal(0),
        }
    });
};

/* =============================
   CREATE
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

        if (!data.type) throw new Error("Transaction type required");

        const amount = new Prisma.Decimal(data.amount);
        if (amount.lte(0)) throw new Error("Amount must be > 0");

        const date = new Date(data.date);
        if (isNaN(date.getTime())) throw new Error("Invalid date");

        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        /* ---------- IDEMPOTENCY ---------- */

        if (data.idempotencyKey) {
            const existing = await tx.transaction.findUnique({
                where: {idempotencyKey: data.idempotencyKey}
            });
            if (existing) return serialize(existing);
        }

        /* ---------- ACCOUNTS ---------- */

        const fromAccount = data.fromAccountId
            ? await tx.account.findFirst({where: {id: data.fromAccountId, userId}})
            : null;

        const toAccount = data.toAccountId
            ? await tx.account.findFirst({where: {id: data.toAccountId, userId}})
            : null;

        /* ---------- RULES ---------- */

        if (data.type === "INCOME" && !toAccount)
            throw new Error("Invalid toAccountId");

        if (
            (data.type === "EXPENSE" || data.type === "INVESTMENT") &&
            !fromAccount
        )
            throw new Error("Invalid fromAccountId");

        if (data.type === "TRANSFER") {
            if (!fromAccount || !toAccount)
                throw new Error("Both accounts required");
            if (fromAccount.id === toAccount.id)
                throw new Error("Same account transfer");
        }

        if (data.type !== "TRANSFER" && !data.categoryId)
            throw new Error("categoryId required");

        /* ---------- CREATE ---------- */

        const trx = await tx.transaction.create({
            data: {
                userId,
                type: data.type,
                amount,
                date,
                year,
                month,
                categoryId: data.type === "TRANSFER" ? null : data.categoryId,
                fromAccountId: data.fromAccountId ?? null,
                toAccountId: data.toAccountId ?? null,
                paymentMethod: data.paymentMethod as any,
                note: data.note ?? null,
                idempotencyKey: data.idempotencyKey ?? null,
            }
        });

        /* ---------- BALANCE ---------- */

        if (data.type === "EXPENSE" || data.type === "INVESTMENT") {
            await tx.account.update({
                where: {id: fromAccount!.id},
                data: {balance: {decrement: amount}}
            });
        }

        if (data.type === "INCOME") {
            await tx.account.update({
                where: {id: toAccount!.id},
                data: {balance: {increment: amount}}
            });
        }

        if (data.type === "TRANSFER") {
            await Promise.all([
                tx.account.update({
                    where: {id: fromAccount!.id},
                    data: {balance: {decrement: amount}}
                }),
                tx.account.update({
                    where: {id: toAccount!.id},
                    data: {balance: {increment: amount}}
                })
            ]);
        }

        /* ---------- ANALYTICS ---------- */

        await updateAnalytics(tx, userId, year, month, data.type, amount, "increment");

        return serialize(trx);
    });
};

/* =============================
   DELETE
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

        const amount = trx.amount;

        if (trx.type === "EXPENSE" || trx.type === "INVESTMENT") {
            await tx.account.update({
                where: {id: trx.fromAccountId!},
                data: {balance: {increment: amount}}
            });
        }

        if (trx.type === "INCOME") {
            await tx.account.update({
                where: {id: trx.toAccountId!},
                data: {balance: {decrement: amount}}
            });
        }

        if (trx.type === "TRANSFER") {
            await Promise.all([
                tx.account.update({
                    where: {id: trx.fromAccountId!},
                    data: {balance: {increment: amount}}
                }),
                tx.account.update({
                    where: {id: trx.toAccountId!},
                    data: {balance: {decrement: amount}}
                })
            ]);
        }

        /* ---------- ANALYTICS ---------- */

        await updateAnalytics(
            tx,
            userId,
            trx.year,
            trx.month,
            trx.type,
            trx.amount,
            "decrement"
        );

        await tx.transaction.update({
            where: {id: transactionId},
            data: {deletedAt: new Date()}
        });
    });
};

/* =============================
   RESTORE
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

        const amount = trx.amount;

        if (trx.type === "EXPENSE" || trx.type === "INVESTMENT") {
            await tx.account.update({
                where: {id: trx.fromAccountId!},
                data: {balance: {decrement: amount}}
            });
        }

        if (trx.type === "INCOME") {
            await tx.account.update({
                where: {id: trx.toAccountId!},
                data: {balance: {increment: amount}}
            });
        }

        if (trx.type === "TRANSFER") {
            await Promise.all([
                tx.account.update({
                    where: {id: trx.fromAccountId!},
                    data: {balance: {decrement: amount}}
                }),
                tx.account.update({
                    where: {id: trx.toAccountId!},
                    data: {balance: {increment: amount}}
                })
            ]);
        }

        /* ---------- ANALYTICS ---------- */

        await updateAnalytics(
            tx,
            userId,
            trx.year,
            trx.month,
            trx.type,
            trx.amount,
            "increment"
        );

        await tx.transaction.update({
            where: {id: transactionId},
            data: {deletedAt: null}
        });
    });
};

/* =============================
   GET
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