import {CreateTransactionDTO} from './transaction.dto';
import {prisma} from "../../database/prisma";

export const createTransaction = async (
    userId: string,
    data: CreateTransactionDTO
) => {
    return prisma.$transaction(async (tx) => {

        const type = data.transactionType;
        let category = null;

        if (data.categoryId) {
            category = await tx.category.findFirst({
                where: {
                    id: data.categoryId,
                    userId
                },
                include: {
                    children: true
                }
            });

            if (!category) {
                throw new Error("Invalid category");
            }

            if (category.type !== type) {
                throw new Error("Category type does not match transaction type");
            }

            if (category.children.length > 0) {
                throw new Error("Transactions must use a subcategory (leaf only)");
            }
        }

        const amount = data.amount;

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

        // ===============================
        // Balance logic
        // ===============================

        if (type === "EXPENSE") {
            if (!fromAccount) throw new Error("Invalid from account");

            await tx.account.update({
                where: {id: fromAccount.id},
                data: {balance: {decrement: amount}}
            });
        }

        if (type === "INCOME") {
            if (!toAccount) throw new Error("Invalid to account");

            await tx.account.update({
                where: {id: toAccount.id},
                data: {balance: {increment: amount}}
            });
        }

        if (type === "TRANSFER") {
            if (!fromAccount || !toAccount)
                throw new Error("Invalid accounts");

            await tx.account.update({
                where: {id: fromAccount.id},
                data: {balance: {decrement: amount}}
            });

            await tx.account.update({
                where: {id: toAccount.id},
                data: {balance: {increment: amount}}
            });
        }

        if (type === "INVESTMENT") {
            if (!fromAccount) throw new Error("Invalid account");

            await tx.account.update({
                where: {id: fromAccount.id},
                data: {balance: {decrement: amount}}
            });
        }
        const date = new Date(data.date);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        return tx.transaction.create({
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

        return true;
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

        return true;
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