import {CreateTransactionDTO} from './transaction.dto';
import {prisma} from "../../database/prisma";
import {updateMonthlyAnalytics} from "../analytics/analytics.updater";

export const createTransaction = async (
    userId: string,
    data: CreateTransactionDTO
) => {

    return prisma.$transaction(async (tx) => {

        const type = data.transactionType;
        const amount = data.amount;

        let category = null;

        if (data.categoryId) {
            category = await tx.category.findFirst({
                where: {
                    id: data.categoryId,
                    userId
                },
                include: {children: true}
            });

            if (!category) throw new Error("Invalid category");

            if (category.type !== type)
                throw new Error("Category type mismatch");

            if (category.children.length > 0)
                throw new Error("Transactions must use subcategory");
        }

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

        if (type === "EXPENSE" || type === "INVESTMENT") {
            if (!fromAccount) throw new Error("fromAccountId required");
        }

        if (type === "INCOME") {
            if (!toAccount) throw new Error("toAccountId required");
        }

        if (type === "TRANSFER") {
            if (!fromAccount || !toAccount)
                throw new Error("Both accounts required");

            if (fromAccount.id === toAccount.id)
                throw new Error("Cannot transfer to same account");
        }

        if (type === "EXPENSE") {
            await tx.account.update({
                where: {id: fromAccount!.id},
                data: {balance: {decrement: amount}}
            });
        }

        if (type === "INCOME") {
            await tx.account.update({
                where: {id: toAccount!.id},
                data: {balance: {increment: amount}}
            });
        }

        if (type === "TRANSFER") {
            await tx.account.update({
                where: {id: fromAccount!.id},
                data: {balance: {decrement: amount}}
            });

            await tx.account.update({
                where: {id: toAccount!.id},
                data: {balance: {increment: amount}}
            });
        }

        if (type === "INVESTMENT") {
            await tx.account.update({
                where: {id: fromAccount!.id},
                data: {balance: {decrement: amount}}
            });
        }

        const date = new Date(data.date);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        const trx = await tx.transaction.create({
            data: {
                userId,
                type,
                amount,
                paymentMethod: data.paymentMethod,
                date,
                year,
                month,
                categoryId: data.categoryId,
                fromAccountId: data.fromAccountId,
                toAccountId: data.toAccountId,
                note: data.note
            }
        });

        if (type !== "TRANSFER") {
            await updateMonthlyAnalytics(
                tx,
                userId,
                year,
                month,
                type,
                amount,
                "add"
            );
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

        const amount = trx.amount;

        // Reverse based on original type
        if (trx.type === 'INCOME') {
            await tx.account.update({
                where: {id: trx.toAccountId!},
                data: {balance: {decrement: amount}}
            });
        }

        if (trx.type === 'EXPENSE') {
            await tx.account.update({
                where: {id: trx.fromAccountId!},
                data: {balance: {increment: amount}}
            });
        }

        if (trx.type === 'TRANSFER') {
            await tx.account.update({
                where: {id: trx.fromAccountId!},
                data: {balance: {increment: amount}}
            });

            await tx.account.update({
                where: {id: trx.toAccountId!},
                data: {balance: {decrement: amount}}
            });
        }

        if (trx.type === 'INVESTMENT') {
            await tx.account.update({
                where: {id: trx.fromAccountId!},
                data: {balance: {increment: amount}}
            });
        }

        // Soft delete
        await tx.transaction.update({
            where: {id: transactionId},
            data: {deletedAt: new Date()}
        });

        if (trx.type !== "TRANSFER") {
            await updateMonthlyAnalytics(
                tx,
                userId,
                trx.year,
                trx.month,
                trx.type,
                trx.amount,
                "remove"
            );
        }
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

        const amount = trx.amount;

        // Reapply original effect
        if (trx.type === 'INCOME') {
            await tx.account.update({
                where: {id: trx.toAccountId!},
                data: {balance: {increment: amount}}
            });
        }

        if (trx.type === 'EXPENSE') {
            await tx.account.update({
                where: {id: trx.fromAccountId!},
                data: {balance: {decrement: amount}}
            });
        }

        if (trx.type === 'TRANSFER') {
            await tx.account.update({
                where: {id: trx.fromAccountId!},
                data: {balance: {decrement: amount}}
            });

            await tx.account.update({
                where: {id: trx.toAccountId!},
                data: {balance: {increment: amount}}
            });
        }

        if (trx.type === 'INVESTMENT') {
            await tx.account.update({
                where: {id: trx.fromAccountId!},
                data: {balance: {decrement: amount}}
            });
        }

        await tx.transaction.update({
            where: {id: transactionId},
            data: {deletedAt: null}
        });

        if (trx.type !== "TRANSFER") {
            await updateMonthlyAnalytics(
                tx,
                userId,
                trx.year,
                trx.month,
                trx.type,
                trx.amount,
                "add"
            );
        }
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