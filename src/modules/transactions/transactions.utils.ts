import {CategoryAssignmentSource, MerchantMappingSource, Prisma, Transaction, TransactionType} from "@prisma/client";

import {learnMerchantCategory, resolveTransactionMerchant} from "../merchant/merchant.service";

import {postTransactionToLedger} from "../ledger/ledger.service";
import {updateAnalytics} from "./transaction.service";
import {ResolveTransactionMerchantResult} from "../merchant/merchant.types";

export type TransactionSortBy =
    | "date"
    | "createdAt";

export type SortOrder =
    | "asc"
    | "desc";

export const validateTransactionBasics = ({amount, date,}: { amount: number; date: string; }) => {

    const decimalAmount = new Prisma.Decimal(amount);
    if (decimalAmount.lte(0)) {
        throw new Error("Amount must be > 0");
    }

    const transactionDate = new Date(date);
    if (isNaN(transactionDate.getTime())) {
        throw new Error("Invalid date");
    }

    return {
        amount: decimalAmount,
        date: transactionDate,
        year: transactionDate.getFullYear(),
        month: transactionDate.getMonth() + 1,
    };
};

export const findIdempotentTransaction = async ({tx, idempotencyKey, include,}: {
    tx: Prisma.TransactionClient;
    idempotencyKey?: string;
    include?: Prisma.TransactionInclude;
}) => {

    if (!idempotencyKey) {
        return null;
    }

    const existing = await tx.transaction.findUnique({
        where: {
            idempotencyKey,
        },
    });

    if (!existing) {
        return null;
    }

    return tx.transaction.findUnique({
        where: {
            id: existing.id,
        },
        include,
    });
};

export const getExistingTransaction = async ({tx, userId, transactionId,}: {
    tx: Prisma.TransactionClient;
    userId: string;
    transactionId: string;
}) => {
    const transaction =
        await tx.transaction.findFirst({
            where: {
                id: transactionId,
                userId,
                deletedAt: null,
            },
        });

    if (!transaction) {
        throw new Error("Transaction not found");
    }

    return transaction;
};

export const validateTransactionAccounts = async ({tx, userId, type, sourceAccountId, destinationAccountId,}: {
    tx: Prisma.TransactionClient;
    userId: string;
    type: TransactionType;
    sourceAccountId?: string | null;
    destinationAccountId?: string | null;
}) => {

    const findAccount = (id?: string | null) =>
        id
            ? tx.financialAccount.findFirst({
                where: {
                    id,
                    userId,
                    deletedAt: null,
                    isArchived: false,
                },
            }) : Promise.resolve(null);

    const fromAccount = await findAccount(sourceAccountId);
    const toAccount = await findAccount(destinationAccountId);

    if (type === TransactionType.INCOME && !toAccount) {
        throw new Error("Invalid destination account");
    }

    if ((type === TransactionType.EXPENSE || type === TransactionType.INVESTMENT) && !fromAccount) {
        throw new Error("Invalid source account");
    }

    if (type === TransactionType.TRANSFER) {
        if (!fromAccount || !toAccount) {
            throw new Error("Both accounts are required");
        }

        if (fromAccount.id === toAccount.id) {
            throw new Error("Cannot transfer to same account");
        }
    }

    return {
        sourceAccountId: fromAccount?.id ?? null,
        destinationAccountId: toAccount?.id ?? null,
    };
};

export const validateTransactionCategory = async ({tx, userId, type, categoryId,}: {
    tx: Prisma.TransactionClient;
    userId: string;
    type: TransactionType;
    categoryId?: string | null;
}) => {

    if (type === TransactionType.TRANSFER) {
        return;
    }

    if (!categoryId) {
        throw new Error(
            "Either categoryId or merchant is required.",
        );
    }

    const category =
        await tx.category.findFirst({
            where: {
                id: categoryId,
                userId,
            },
        });

    if (!category) {
        throw new Error("Invalid categoryId");
    }

    if (category.type !== type) {
        throw new Error(
            "Category type does not match transaction type",
        );
    }
};

export const learnUserMerchantMapping = async ({userId, transaction, transactionType,}: {
    userId: string;
    transaction: {
        merchantId: string | null;
        categoryId: string | null;
        categoryAssignmentSource: CategoryAssignmentSource;
    };
    transactionType: TransactionType;
}) => {

    if (transactionType === TransactionType.TRANSFER || !transaction.merchantId || !transaction.categoryId ||
        transaction.categoryAssignmentSource !== CategoryAssignmentSource.USER) {
        return;
    }

    await learnMerchantCategory(userId, transaction.merchantId, transaction.categoryId, MerchantMappingSource.USER,);
};

export const resolveNewTransactionMerchant = async ({userId, merchantRaw, transactionType, categoryId,}: {
    userId: string;
    merchantRaw?: string | null;
    transactionType: TransactionType;
    categoryId?: string | null;
}): Promise<ResolveTransactionMerchantResult> => {

    const shouldCategorize = !categoryId && transactionType !== TransactionType.TRANSFER;
    return resolveTransactionMerchant({userId, merchantRaw, transactionType, shouldCategorize,});
};

export const applyTransactionEffects = async ({
                                                  tx,
                                                  userId,
                                                  transaction,
                                                  amount,
                                              }: {
    tx: Prisma.TransactionClient;
    userId: string;
    transaction: Prisma.TransactionGetPayload<{}>;
    amount: Prisma.Decimal;
}) => {

    const shouldPostLedger =
        (transaction.type === TransactionType.INCOME &&
            transaction.destinationAccountId) ||

        ((transaction.type === TransactionType.EXPENSE ||
                transaction.type === TransactionType.INVESTMENT) &&
            transaction.sourceAccountId) ||

        (transaction.type === TransactionType.TRANSFER &&
            transaction.sourceAccountId &&
            transaction.destinationAccountId);

    if (shouldPostLedger) {
        await postTransactionToLedger(
            tx,
            userId,
            transaction,
            amount,
        );
    }

    await updateAnalytics(
        tx,
        userId,
        transaction.year,
        transaction.month,
        transaction.type,
        amount,
        "increment",
    );
};

export const removeTransactionEffects = async ({
                                                   tx,
                                                   userId,
                                                   transaction,
                                               }: {
    tx: Prisma.TransactionClient;
    userId: string;
    transaction: {
        id: string;
        type: TransactionType;
        year: number;
        month: number;
        amount: Prisma.Decimal;
    };
}) => {

    await tx.ledgerEntry.deleteMany({
        where: {
            transactionId: transaction.id,
        },
    });

    await updateAnalytics(
        tx,
        userId,
        transaction.year,
        transaction.month,
        transaction.type,
        transaction.amount,
        "decrement",
    );
};

export const resolveTransactionUpdate = async ({
                                                   tx,
                                                   userId,
                                                   existing,
                                                   data,
                                               }: {
    tx: Prisma.TransactionClient;
    userId: string;
    existing: Transaction;
    data: {
        type: TransactionType;
        merchant?: string;
        categoryId?: string;
    };
}) => {

    let merchantId = existing.merchantId;
    let merchantRaw = existing.merchantRaw;

    let categoryId = data.categoryId ?? existing.categoryId;
    let categoryAssignmentSource = existing.categoryAssignmentSource;
    let aiCategoryConfidence = existing.aiCategoryConfidence;

    if (data.merchant !== undefined) {

        merchantRaw = data.merchant.trim() || null;

        if (!merchantRaw) {
            merchantId = null;

            if (!data.categoryId) {
                categoryId = null;
                categoryAssignmentSource = CategoryAssignmentSource.USER;
                aiCategoryConfidence = null;
            }

            return {
                merchantId,
                merchantRaw,
                categoryId,
                categoryAssignmentSource,
                aiCategoryConfidence,
            };
        }

        const merchantChanged =
            merchantRaw !== existing.merchantRaw;

        const shouldCategorize =
            data.type !== TransactionType.TRANSFER &&
            merchantChanged &&
            !data.categoryId &&
            existing.categoryAssignmentSource !==
            CategoryAssignmentSource.USER;

        const merchant =
            await resolveTransactionMerchant({
                userId,
                merchantRaw,
                transactionType: data.type,
                shouldCategorize,
            });

        merchantId = merchant.merchantId;
        merchantRaw = merchant.merchantRaw;

        if (merchant.categoryId) {
            categoryId = merchant.categoryId;
            categoryAssignmentSource =
                merchant.categoryAssignmentSource;
            aiCategoryConfidence =
                merchant.confidence;
        } else if (merchantChanged && !data.categoryId) {
            categoryId = null;
            categoryAssignmentSource =
                CategoryAssignmentSource.USER;
            aiCategoryConfidence = null;
        }
    }

    return {
        merchantId,
        merchantRaw,
        categoryId,
        categoryAssignmentSource,
        aiCategoryConfidence,
    };
};

export const getDeletedTransaction = async ({tx, userId, transactionId,}: {
    tx: Prisma.TransactionClient;
    userId: string;
    transactionId: string;
}) => {

    const transaction =
        await tx.transaction.findFirst({
            where: {
                id: transactionId,
                userId,
                deletedAt: {
                    not: null,
                },
            },
        });

    if (!transaction) {
        throw new Error("Transaction not found");
    }

    return transaction;
};

export const getTransactionOrderBy = (sortBy: TransactionSortBy = "date", order: SortOrder = "desc",): Prisma.TransactionOrderByWithRelationInput => {
    switch (sortBy) {
        case "createdAt":
            return {createdAt: order,};
        case "date":
        default:
            return {date: order,};
    }
};
