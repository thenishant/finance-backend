import {prisma} from "../../database/prisma";
import {CategoryAssignmentSource, Prisma, TransactionType} from "@prisma/client";
import {
    applyTransactionEffects,
    findIdempotentTransaction,
    getDeletedTransaction,
    getExistingTransaction,
    getTransactionOrderBy,
    learnUserMerchantMapping,
    removeTransactionEffects,
    resolveNewTransactionMerchant,
    resolveTransactionUpdate,
    SortOrder,
    TransactionSortBy,
    validateTransactionAccounts,
    validateTransactionBasics,
    validateTransactionCategory
} from "./transactions.utils";
import {transactionInclude} from "./transaction.constants";
import {serialize} from "../../shared/utils/prisma.utils";
import {mapTransaction} from "./transaction.mapper";

const activeTransactionWhere = (userId: string) => ({
    userId,
    deletedAt: null,
});

export const updateAnalytics = async (
    tx: Prisma.TransactionClient,
    userId: string,
    year: number,
    month: number,
    type: TransactionType,
    amount: Prisma.Decimal,
    op: "increment" | "decrement"
) => {
    const analyticsField = {
        [TransactionType.INCOME]: "totalIncome",
        [TransactionType.EXPENSE]: "totalExpense",
        [TransactionType.INVESTMENT]: "totalInvestment",
    } as const;

    switch (type) {
        case TransactionType.TRANSFER:
            return;
    }

    const field = analyticsField[type];
    if (!field) {
        return;
    }
    await tx.monthlyAnalytics.upsert({
        where: {
            userId_year_month: {userId, year, month,},
        },
        update: {
            [field]: {
                [op]: amount
            }
        }, create: {
            userId, year, month,
            totalIncome: type === TransactionType.INCOME ? amount : new Prisma.Decimal(0),
            totalExpense: type === TransactionType.EXPENSE ? amount : new Prisma.Decimal(0),
            totalInvestment: type === TransactionType.INVESTMENT ? amount : new Prisma.Decimal(0),
        },
    });
};


export const createTransaction = async (
    userId: string,
    data: {
        type: TransactionType;
        amount: number;
        date: string;
        merchant?: string;
        categoryId?: string;
        sourceAccountId?: string;
        destinationAccountId?: string;
        note?: string;
        idempotencyKey?: string;
    },
) => {
    return prisma.$transaction(async tx => {
        const {amount, date, year, month,} = validateTransactionBasics({amount: data.amount, date: data.date,});

        const existing = await findIdempotentTransaction({
            tx,
            idempotencyKey: data.idempotencyKey,
            include: transactionInclude,
        });

        if (existing) {
            return serialize(
                mapTransaction(existing),
            );
        }

        const {sourceAccountId, destinationAccountId,} = await validateTransactionAccounts({
            tx,
            userId,
            type: data.type,
            sourceAccountId:
            data.sourceAccountId,
            destinationAccountId:
            data.destinationAccountId,
        });

        const merchant = await resolveNewTransactionMerchant({
            userId,
            merchantRaw: data.merchant,
            transactionType: data.type,
            categoryId: data.categoryId,
        });

        const categoryId = data.categoryId ?? merchant.categoryId;
        const categoryAssignmentSource = data.categoryId ? CategoryAssignmentSource.USER : merchant.categoryAssignmentSource;
        const aiCategoryConfidence = data.categoryId ? null : merchant.confidence;
        await validateTransactionCategory({tx, userId, type: data.type, categoryId,});
        const transaction = await tx.transaction.create({
            data: {
                userId,
                type: data.type,
                amount,
                date,
                year,
                month,

                merchantId: merchant.merchantId,
                merchantRaw: merchant.merchantRaw,

                categoryId:
                    data.type === TransactionType.TRANSFER
                        ? null
                        : categoryId,

                categoryAssignmentSource:
                    data.type === TransactionType.TRANSFER
                        ? CategoryAssignmentSource.USER
                        : categoryAssignmentSource,

                aiCategoryConfidence,

                sourceAccountId,
                destinationAccountId,

                note: data.note ?? null,
                idempotencyKey: data.idempotencyKey ?? null,
            },
            include: transactionInclude,
        });

        console.info("[Transaction] Created", {
            id: transaction.id,
            amount: transaction.amount.toString(),
            fingerPrint: transaction.fingerprint,
            gmailMessageId: transaction.gmailMessageId,
        });

        await learnUserMerchantMapping({userId, transaction, transactionType: data.type,});
        await applyTransactionEffects({tx, userId, transaction, amount,});
        return serialize(mapTransaction(transaction),
        );
    })
        ;
};

export const deleteTransaction = async (
    userId: string,
    transactionId: string,
) => {
    return prisma.$transaction(async tx => {

        const transaction =
            await getExistingTransaction({
                tx,
                userId,
                transactionId,
            });

        await removeTransactionEffects({
            tx,
            userId,
            transaction,
        });

        const deleted =
            await tx.transaction.update({
                where: {
                    id: transaction.id,
                },
                data: {
                    deletedAt: new Date(),
                },
                include: transactionInclude,
            });

        return serialize(
            mapTransaction(deleted),
        );
    });
};

export const restoreTransaction = async (
    userId: string,
    transactionId: string,
) => {

    return prisma.$transaction(async tx => {

        const transaction =
            await getDeletedTransaction({
                tx,
                userId,
                transactionId,
            });

        const restored =
            await tx.transaction.update({
                where: {
                    id: transaction.id,
                },
                data: {
                    deletedAt: null,
                },
                include: transactionInclude,
            });

        await applyTransactionEffects({
            tx,
            userId,
            transaction: restored,
            amount: restored.amount,
        });

        return serialize(
            mapTransaction(restored),
        );
    });
};

export const getRecentTransactions = async (
    userId: string,
    limit = 5,
    sortBy: TransactionSortBy = "date",
    order: SortOrder = "desc",
) => {

    const transactions =
        await prisma.transaction.findMany({
            where: activeTransactionWhere(userId),
            include: transactionInclude,
            orderBy: getTransactionOrderBy(sortBy, order,),
            take: limit,
        });

    return serialize(
        transactions.map(mapTransaction),
    );
};

export const getTransactions = async (
    userId: string,
    sortBy: TransactionSortBy = "date",
    order: SortOrder = "desc",
) => {
    const transactions =
        await prisma.transaction.findMany({
            where: activeTransactionWhere(userId),
            include: transactionInclude,
            orderBy: getTransactionOrderBy(sortBy, order,),
        });

    return serialize(transactions.map(mapTransaction),);
};

export const getTransactionById = async (
    userId: string,
    transactionId: string,
) => {

    const transaction =
        await prisma.transaction.findFirst({
            where: {
                id: transactionId,
                ...activeTransactionWhere(userId),
            },
            include: transactionInclude,
        });

    if (!transaction) {
        throw new Error("Transaction not found");
    }

    return serialize(
        mapTransaction(transaction),
    );
};
export const updateTransaction = async (
    userId: string,
    transactionId: string,
    data: {
        type: TransactionType;
        amount: number;
        date: string;
        merchant?: string;
        categoryId?: string;
        sourceAccountId?: string;
        destinationAccountId?: string;
        updateMerchantMapping?: boolean;
        note?: string;
    },
) => {
    return prisma.$transaction(async tx => {

        const existing = await getExistingTransaction({
            tx,
            userId,
            transactionId,
        });

        const {
            amount,
            date,
        } = validateTransactionBasics({
            amount: data.amount,
            date: data.date,
        });

        const sameDay =
            existing.date.getFullYear() === date.getFullYear() &&
            existing.date.getMonth() === date.getMonth() &&
            existing.date.getDate() === date.getDate();

        const year = sameDay
            ? existing.year
            : date.getFullYear();

        const month = sameDay
            ? existing.month
            : date.getMonth() + 1;

        const {
            sourceAccountId,
            destinationAccountId,
        } = await validateTransactionAccounts({
            tx,
            userId,
            type: data.type,
            sourceAccountId:
                data.sourceAccountId ??
                existing.sourceAccountId,
            destinationAccountId:
                data.destinationAccountId ??
                existing.destinationAccountId,
        });

        const merchant = await resolveTransactionUpdate({
            tx,
            userId,
            existing,
            data,
        });

        await validateTransactionCategory({
            tx,
            userId,
            type: data.type,
            categoryId: merchant.categoryId,
        });

        const analyticsChanged =
            existing.type !== data.type ||
            !existing.amount.equals(amount) ||
            existing.year !== year ||
            existing.month !== month ||
            existing.sourceAccountId !== sourceAccountId ||
            existing.destinationAccountId !== destinationAccountId;

        if (analyticsChanged) {
            await removeTransactionEffects({
                tx,
                userId,
                transaction: existing,
            });
        }

        const updated = await tx.transaction.update({
            where: {
                id: existing.id,
            },
            data: {
                type: data.type,
                amount,
                date,
                year,
                month,

                merchantId: merchant.merchantId,
                merchantRaw: merchant.merchantRaw,

                categoryId:
                    data.type === TransactionType.TRANSFER
                        ? null
                        : merchant.categoryId,

                categoryAssignmentSource:
                    data.type === TransactionType.TRANSFER
                        ? CategoryAssignmentSource.USER
                        : merchant.categoryAssignmentSource,

                aiCategoryConfidence:
                merchant.aiCategoryConfidence,

                sourceAccountId,
                destinationAccountId,

                note: data.note ?? existing.note,
            },
            include: transactionInclude,
        });

        if (
            updated.merchantId !== existing.merchantId ||
            updated.categoryId !== existing.categoryId
        ) {
            await learnUserMerchantMapping({
                userId,
                transaction: updated,
                transactionType: data.type,
            });
        }

        if (analyticsChanged) {
            await applyTransactionEffects({
                tx,
                userId,
                transaction: updated,
                amount,
            });
        }

        return serialize(
            mapTransaction(updated),
        );
    });
};