import {CategoryAssignmentSource, Prisma, TransactionType} from "@prisma/client";

import {prisma} from "../../database/prisma";

import {serialize} from "../../shared/utils/prisma.utils";
import {needsCategoryReview} from "../merchant/merchant.review";

import {transactionInclude} from "./transaction.constants";

import {
    deleteLedgerEntries,
    findIdempotentTransaction,
    getDeletedTransaction,
    getExistingTransaction,
    getTransactionOrderBy,
    learnUserMerchantMapping,
    postLedgerEntries,
    resolveNewTransactionMerchant,
    resolveTransactionUpdate,
    SortOrder,
    TransactionSortBy,
    validateTransactionAccounts,
    validateTransactionBasics,
    validateTransactionCategory,
} from "./transactions.utils";

type CreateTransactionInput = {
    type: TransactionType;
    amount: number;
    date: string;
    merchant?: string;
    categoryId?: string;
    sourceAccountId?: string;
    destinationAccountId?: string;
    note?: string;
    idempotencyKey?: string;
};

type UpdateTransactionInput = {
    type?: TransactionType;
    amount?: number;
    date?: string | Date;
    merchant?: string | null;
    categoryId?: string | null;
    sourceAccountId?: string | null;
    destinationAccountId?: string | null;
    updateMerchantMapping?: boolean;
    note?: string | null;
};

export type TransactionFilters = {
    type?: TransactionType;
    categoryId?: string;
    accountId?: string;
    from?: string | Date;
    to?: string | Date;
};

const activeTransactionWhere = (userId: string) => ({
    userId,
    deletedAt: null,
});

const mapTransaction = <
    T extends {
        categoryAssignmentSource: CategoryAssignmentSource;
        aiCategoryConfidence: number | null;
        category?: {
            name: string;
        } | null;
    }
>(
    transaction: T,
) => ({
    ...transaction,
    needsCategoryReview: needsCategoryReview({
        assignmentSource: transaction.categoryAssignmentSource,
        confidence: transaction.aiCategoryConfidence,
        categoryName: transaction.category?.name,
    }),
});

const serializeTransaction = <T extends Parameters<typeof mapTransaction>[0]>(
    transaction: T,
) => serialize(mapTransaction(transaction));

const serializeTransactions = <T extends Parameters<typeof mapTransaction>[0]>(
    transactions: T[],
) => serialize(transactions.map(mapTransaction));

const buildTransactionWhere = (
    userId: string,
    filters: TransactionFilters = {},
): Prisma.TransactionWhereInput => {
    const where: Prisma.TransactionWhereInput = activeTransactionWhere(userId);

    if (filters.type) {
        where.type = filters.type;
    }

    if (filters.categoryId) {
        where.categoryId = filters.categoryId;
    }

    if (filters.accountId) {
        where.OR = [
            {
                sourceAccountId: filters.accountId,
            },
            {
                destinationAccountId: filters.accountId,
            },
        ];
    }

    if (filters.from || filters.to) {
        where.date = {
            ...(filters.from
                ? {
                    gte: filters.from instanceof Date
                        ? filters.from
                        : new Date(filters.from),
                }
                : {}),
            ...(filters.to
                ? {
                    lte: filters.to instanceof Date
                        ? filters.to
                        : new Date(filters.to),
                }
                : {}),
        };
    }

    return where;
};

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
        [TransactionType.TRANSFER]: "totalTransfer",
    } as const;

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
            totalTransfer: type === TransactionType.TRANSFER ? amount : new Prisma.Decimal(0),
        },
    });
};


export const createTransaction = async (
    userId: string,
    data: CreateTransactionInput,
) => {
    const merchant =
        await resolveNewTransactionMerchant({
            userId,
            merchantRaw: data.merchant,
            transactionType: data.type,
            categoryId: data.categoryId,
        });

    return prisma.$transaction(async tx => {
        const {
            amount,
            date,
            year,
            month,
        } = validateTransactionBasics({
            amount: data.amount,
            date: data.date,
        });

        const existing =
            await findIdempotentTransaction({
                tx,
                idempotencyKey:
                data.idempotencyKey,
            });

        if (existing) {
            return serializeTransaction(
                existing,
            );
        }

        const categoryId =
            data.categoryId ??
            merchant.categoryId;

        const categoryAssignmentSource =
            data.categoryId
                ? CategoryAssignmentSource.USER
                : merchant.categoryAssignmentSource;

        const aiCategoryConfidence =
            data.categoryId
                ? null
                : merchant.confidence;


        const [
            {
                sourceAccountId,
                destinationAccountId,
            },
        ] = await Promise.all([
            validateTransactionAccounts({
                tx,
                userId,
                type: data.type,
                sourceAccountId:
                data.sourceAccountId,
                destinationAccountId:
                data.destinationAccountId,
            }),
            validateTransactionCategory({
                tx,
                userId,
                type: data.type,
                categoryId,
            }),
        ]);

        const transaction =
            await tx.transaction.create({
                data: {
                    userId,
                    type: data.type,
                    amount,
                    date,
                    year,
                    month,

                    merchantId:
                    merchant.merchantId,

                    merchantRaw:
                    merchant.merchantRaw,

                    merchantNormalized:
                    merchant.merchantNormalized,

                    categoryId:
                        data.type ===
                        TransactionType.TRANSFER
                            ? null
                            : categoryId,

                    categoryAssignmentSource:
                        data.type ===
                        TransactionType.TRANSFER
                            ? CategoryAssignmentSource.USER
                            : categoryAssignmentSource,

                    aiCategoryConfidence,

                    sourceAccountId,
                    destinationAccountId,

                    note:
                        data.note ?? null,

                    idempotencyKey:
                        data.idempotencyKey ?? null,
                },

                include:
                transactionInclude,
            });

        await Promise.all([
            learnUserMerchantMapping({
                tx,
                userId,
                transaction,
                transactionType: data.type,
            }),
            postLedgerEntries({
                tx,
                userId,
                transaction,
                amount,
            }),
            updateAnalytics(
                tx,
                userId,
                year,
                month,
                transaction.type,
                amount,
                "increment",
            ),
        ]);

        return serializeTransaction(
            transaction,
        );
    });
};

export const deleteTransaction = async (userId: string, transactionId: string,) => {
    return prisma.$transaction(async tx => {
        const transaction =
            await getExistingTransaction({
                tx,
                userId,
                transactionId,
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

        await Promise.all([
            deleteLedgerEntries({tx, transactionId: transaction.id,}),
            updateAnalytics(
                tx,
                userId,
                transaction.year,
                transaction.month,
                transaction.type,
                transaction.amount,
                "decrement",
            ),
        ]);
        return serializeTransaction(deleted);
    });
};

export const restoreTransaction = async (userId: string, transactionId: string,) => {
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

        await Promise.all([
            postLedgerEntries({
                tx,
                userId,
                transaction: restored,
                amount: restored.amount,
            }),
            updateAnalytics(
                tx,
                userId,
                restored.year,
                restored.month,
                restored.type,
                restored.amount,
                "increment",
            ),
        ]);

        return serializeTransaction(restored);
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

    return serializeTransactions(transactions);
};

export const getTransactions = async (
    userId: string,
    sortBy: TransactionSortBy = "date",
    order: SortOrder = "desc",
    filters: TransactionFilters = {},
) => {
    const transactions =
        await prisma.transaction.findMany({
            where: buildTransactionWhere(userId, filters),
            include: transactionInclude,
            orderBy: getTransactionOrderBy(sortBy, order,),
        });

    return serializeTransactions(transactions);
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

    return serializeTransaction(transaction);
};

export const updateTransaction = async (
    userId: string,
    transactionId: string,
    data: UpdateTransactionInput,
) => {
    const existing =
        await prisma.transaction.findFirst({
            where: {
                id: transactionId,
                userId,
                deletedAt: null,
            },
            include: transactionInclude,
        });

    if (!existing) {
        throw new Error(
            "Transaction not found.",
        );
    }
    const merged = {
        type:
            data.type ??
            existing.type,

        amount:
            data.amount ??
            Number(existing.amount),

        date:
            data.date ??
            existing.date.toISOString(),

        merchant:
            data.merchant === undefined
                ? existing.merchantRaw
                : data.merchant,

        categoryId:
            data.categoryId === undefined
                ? existing.categoryId
                : data.categoryId,

        sourceAccountId:
            data.sourceAccountId === undefined
                ? existing.sourceAccountId
                : data.sourceAccountId,

        destinationAccountId:
            data.destinationAccountId === undefined
                ? existing.destinationAccountId
                : data.destinationAccountId,

        note:
            data.note === undefined
                ? existing.note
                : data.note,
    };
    let merchant: {
        merchantId: string | null;
        merchantRaw: string | null;
        merchantNormalized: string | null;
        categoryId: string | null;
        categoryAssignmentSource: CategoryAssignmentSource;
        aiCategoryConfidence: number | null;
    };

    if (data.merchant !== undefined) {
        merchant = await resolveTransactionUpdate({
            userId,
            existing,
            data: {
                type: merged.type,
                merchant: data.merchant,
                categoryId:
                    data.categoryId === undefined
                        ? existing.categoryId
                        : data.categoryId,
            },
        });
    } else if (data.categoryId !== undefined) {
        merchant = {
            merchantId:
            existing.merchantId,

            merchantRaw:
            existing.merchantRaw,

            merchantNormalized:
            existing.merchantNormalized,

            categoryId:
                merged.type === TransactionType.TRANSFER
                    ? null
                    : data.categoryId,

            categoryAssignmentSource:
                merged.type === TransactionType.TRANSFER
                    ? CategoryAssignmentSource.USER
                    : CategoryAssignmentSource.USER,

            aiCategoryConfidence:
                null,
        };
    } else if (data.type !== undefined && data.type !== existing.type) {
        const existingCategoryIsValid = existing.category?.type === merged.type;
        merchant = {
            merchantId: existing.merchantId,
            merchantRaw: existing.merchantRaw,
            merchantNormalized: existing.merchantNormalized,
            categoryId:
                merged.type === TransactionType.TRANSFER
                    ? null
                    : existingCategoryIsValid
                        ? existing.categoryId
                        : null,

            categoryAssignmentSource:
                merged.type === TransactionType.TRANSFER
                    ? CategoryAssignmentSource.USER
                    : existingCategoryIsValid
                        ? existing.categoryAssignmentSource
                        : CategoryAssignmentSource.NONE,

            aiCategoryConfidence:
                merged.type === TransactionType.TRANSFER ||
                !existingCategoryIsValid
                    ? null
                    : existing.aiCategoryConfidence,
        };
    } else {
        merchant = {
            merchantId:
            existing.merchantId,

            merchantRaw:
            existing.merchantRaw,

            merchantNormalized:
            existing.merchantNormalized,

            categoryId:
            existing.categoryId,

            categoryAssignmentSource:
            existing.categoryAssignmentSource,

            aiCategoryConfidence:
            existing.aiCategoryConfidence,
        };
    }

    return prisma.$transaction(async tx => {
        const current =
            await getExistingTransaction({
                tx,
                userId,
                transactionId,
            });

        const {
            amount,
            date,
            year,
            month,
        } = validateTransactionBasics({
            amount: merged.amount,
            date: merged.date,
        });

        /*
         * Validate accounts against the NEW transaction state.
         */
        const {
            sourceAccountId,
            destinationAccountId,
        } = await validateTransactionAccounts({
            tx,
            userId,
            type: merged.type,
            sourceAccountId:
            merged.sourceAccountId,
            destinationAccountId:
            merged.destinationAccountId,
        });

        /*
         * Validate the resolved category.
         *
         * Transfers intentionally have no category.
         */
        await validateTransactionCategory({
            tx,
            userId,
            type: merged.type,
            categoryId:
            merchant.categoryId,
        });

        const financialChanged =
            current.type !== merged.type ||
            !current.amount.equals(amount) ||
            current.year !== year ||
            current.month !== month ||
            current.sourceAccountId !==
            sourceAccountId ||
            current.destinationAccountId !==
            destinationAccountId;
        const updated =
            await tx.transaction.update({
                where: {
                    id: transactionId,
                },

                data: {
                    type: merged.type,
                    amount,
                    date,
                    year,
                    month,
                    sourceAccountId,
                    destinationAccountId,
                    merchantId: merchant.merchantId,
                    merchantRaw: merchant.merchantRaw,
                    merchantNormalized:
                    merchant.merchantNormalized,

                    categoryId:
                        merged.type ===
                        TransactionType.TRANSFER
                            ? null
                            : merchant.categoryId,

                    categoryAssignmentSource:
                        merged.type ===
                        TransactionType.TRANSFER
                            ? CategoryAssignmentSource.USER
                            : merchant.categoryAssignmentSource,

                    aiCategoryConfidence:
                        merged.type ===
                        TransactionType.TRANSFER
                            ? null
                            : merchant.aiCategoryConfidence,

                    note:
                    merged.note,
                },

                include:
                transactionInclude,
            });
        if (
            updated.merchantId !==
            current.merchantId ||
            updated.categoryId !==
            current.categoryId
        ) {
            await learnUserMerchantMapping({
                tx,
                userId,
                transaction: updated,
                transactionType:
                merged.type,
            });
        }

        const analyticsChanged =
            current.type !== merged.type ||
            !current.amount.equals(amount) ||
            current.year !== year ||
            current.month !== month;

        if (financialChanged) {
            await deleteLedgerEntries({
                tx,
                transactionId:
                current.id,
            });

            /*
             * Create ledger entries for the new state.
             */
            await postLedgerEntries({
                tx,
                userId,
                transaction: updated,
                amount,
            });

        }

        if (analyticsChanged) {
            await updateAnalytics(
                tx,
                userId,
                current.year,
                current.month,
                current.type,
                current.amount,
                "decrement",
            );

            await updateAnalytics(
                tx,
                userId,
                year,
                month,
                updated.type,
                amount,
                "increment",
            );
        }

        return serializeTransaction(
            updated,
        );
    });
};
