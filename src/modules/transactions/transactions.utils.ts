import {CategoryAssignmentSource, MerchantMappingSource, Prisma, TransactionType,} from "@prisma/client";

import {ResolveTransactionMerchantResult,} from "../merchant/merchant.types";

import {postTransactionToLedger,} from "../ledger/ledger.service";

import {transactionInclude, TransactionWithRelations,} from "./transaction.constants";

import {prisma} from "../../database/prisma";


/*
 * --------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------
 */

export type TransactionSortBy =
    | "date"
    | "createdAt"
    | "amount"
    | "merchant"
    | "category";


export type SortOrder =
    | "asc"
    | "desc";


export interface TransactionBasics {
    amount: Prisma.Decimal;
    date: Date;
    year: number;
    month: number;
}


export interface TransactionAccountIds {
    sourceAccountId: string | null;
    destinationAccountId: string | null;
}


/*
 * --------------------------------------------------------------------------
 * Transaction validation
 * --------------------------------------------------------------------------
 */

export function validateTransactionBasics({
                                              amount,
                                              date,
                                          }: {
    amount: number;
    date: string | Date;
}): TransactionBasics {

    const decimalAmount =
        new Prisma.Decimal(amount);


    if (decimalAmount.lte(0)) {
        throw new Error(
            "Amount must be greater than zero.",
        );
    }


    const transactionDate =
        date instanceof Date
            ? date
            : new Date(date);


    if (
        Number.isNaN(
            transactionDate.getTime(),
        )
    ) {
        throw new Error(
            "Invalid transaction date.",
        );
    }


    return {

        amount:
        decimalAmount,

        date:
        transactionDate,

        year:
            transactionDate.getFullYear(),

        month:
            transactionDate.getMonth() + 1,
    };
}


/*
 * --------------------------------------------------------------------------
 * Idempotency
 * --------------------------------------------------------------------------
 */

export async function findIdempotentTransaction({
                                                    tx,
                                                    idempotencyKey,
                                                }: {
    tx: Prisma.TransactionClient;
    idempotencyKey?: string;
}): Promise<TransactionWithRelations | null> {

    if (!idempotencyKey) {
        return null;
    }


    return tx.transaction.findUnique({

        where: {
            idempotencyKey,
        },

        include:
        transactionInclude,
    });
}


/*
 * --------------------------------------------------------------------------
 * Transaction lookup
 * --------------------------------------------------------------------------
 */

export async function getExistingTransaction({
                                                 tx,
                                                 userId,
                                                 transactionId,
                                             }: {
    tx: Prisma.TransactionClient;
    userId: string;
    transactionId: string;
}): Promise<TransactionWithRelations> {

    const transaction =
        await tx.transaction.findFirst({

            where: {

                id:
                transactionId,

                userId,

                deletedAt:
                    null,
            },

            include:
            transactionInclude,
        });


    if (!transaction) {
        throw new Error(
            "Transaction not found.",
        );
    }


    return transaction;
}


export async function getDeletedTransaction({
                                                tx,
                                                userId,
                                                transactionId,
                                            }: {
    tx: Prisma.TransactionClient;
    userId: string;
    transactionId: string;
}): Promise<TransactionWithRelations> {

    const transaction =
        await tx.transaction.findFirst({

            where: {

                id:
                transactionId,

                userId,

                deletedAt: {
                    not: null,
                },
            },

            include:
            transactionInclude,
        });


    if (!transaction) {
        throw new Error(
            "Transaction not found.",
        );
    }


    return transaction;
}


/*
 * --------------------------------------------------------------------------
 * Account validation
 * --------------------------------------------------------------------------
 */

export async function validateTransactionAccounts({
                                                      tx,
                                                      userId,
                                                      type,
                                                      sourceAccountId,
                                                      destinationAccountId,
                                                  }: {
    tx: Prisma.TransactionClient;
    userId: string;
    type: TransactionType;
    sourceAccountId?: string | null;
    destinationAccountId?: string | null;
}): Promise<TransactionAccountIds> {

    const findAccount = async (
        id?: string | null,
    ) => {

        if (!id) {
            return null;
        }


        return tx.financialAccount.findFirst({

            where: {

                id,

                userId,

                deletedAt:
                    null,

                isArchived:
                    false,
            },
        });
    };


    const [
        sourceAccount,
        destinationAccount,
    ] = await Promise.all([

        findAccount(
            sourceAccountId,
        ),

        findAccount(
            destinationAccountId,
        ),
    ]);


    switch (type) {

        case TransactionType.INCOME:

            if (!destinationAccount) {
                throw new Error(
                    "Destination account is required.",
                );
            }

            break;


        case TransactionType.EXPENSE:

        case TransactionType.INVESTMENT:

            if (!sourceAccount) {
                throw new Error(
                    "Source account is required.",
                );
            }

            break;


        case TransactionType.TRANSFER:

            if (
                !sourceAccount ||
                !destinationAccount
            ) {
                throw new Error(
                    "Both accounts are required.",
                );
            }


            if (
                sourceAccount.id ===
                destinationAccount.id
            ) {
                throw new Error(
                    "Cannot transfer to the same account.",
                );
            }

            break;
    }


    return {

        sourceAccountId:
            sourceAccount?.id ?? null,

        destinationAccountId:
            destinationAccount?.id ?? null,
    };
}


/*
 * --------------------------------------------------------------------------
 * Category validation
 * --------------------------------------------------------------------------
 */

export async function validateTransactionCategory({
                                                      tx,
                                                      userId,
                                                      type,
                                                      categoryId,
                                                  }: {
    tx: Prisma.TransactionClient;
    userId: string;
    type: TransactionType;
    categoryId?: string | null;
}) {

    if (
        type ===
        TransactionType.TRANSFER
    ) {
        return;
    }


    if (!categoryId) {
        throw new Error(
            "Category is required.",
        );
    }


    const category =
        await tx.category.findFirst({

            where: {

                id:
                categoryId,

                userId,
            },
        });


    if (!category) {
        throw new Error(
            "Invalid category.",
        );
    }


    if (
        category.type !==
        type
    ) {
        throw new Error(
            "Category type does not match transaction type.",
        );
    }
}


/*
 * --------------------------------------------------------------------------
 * Manual transaction merchant resolution
 * --------------------------------------------------------------------------
 *
 * Manual merchants are authoritative.
 *
 * We intentionally DO NOT:
 *
 * - normalize the value
 * - resolve aliases
 * - use AI
 * - categorize with AI
 *
 * This prevents a user-entered merchant from unexpectedly
 * becoming a different merchant.
 */

export async function resolveNewTransactionMerchant({
                                                        userId,
                                                        merchantRaw,
                                                        transactionType,
                                                        categoryId,
                                                    }: {
    userId: string;
    merchantRaw?: string | null;
    transactionType: TransactionType;
    categoryId?: string | null;
}): Promise<ResolveTransactionMerchantResult> {

    void userId;
    void transactionType;


    const raw =
        merchantRaw?.trim();


    if (!raw) {

        return {

            merchant:
                null,

            merchantId:
                null,

            merchantRaw:
                null,

            merchantNormalized:
                null,

            category:
                null,

            categoryId:
                null,

            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,

            confidence:
                null,
        };
    }


    const merchant =
        await prisma.merchant.upsert({

            where: {
                name:
                raw,
            },

            update: {},

            create: {
                name:
                raw,
            },
        });


    return {

        merchant,

        merchantId:
        merchant.id,

        merchantRaw:
        raw,

        merchantNormalized:
        merchant.name,

        category:
            null,

        categoryId:
            null,

        categoryAssignmentSource:
            categoryId != null
                ? CategoryAssignmentSource.USER
                : CategoryAssignmentSource.NONE,

        confidence:
            null,
    };
}


/*
 * --------------------------------------------------------------------------
 * Learn user merchant mapping
 * --------------------------------------------------------------------------
 */

export async function learnUserMerchantMapping({
                                                   tx,
                                                   userId,
                                                   transaction,
                                                   transactionType,
                                               }: {
    tx: Prisma.TransactionClient;
    userId: string;

    transaction: {
        merchantId: string | null;
        categoryId: string | null;

        categoryAssignmentSource:
            CategoryAssignmentSource;
    };

    transactionType:
        TransactionType;
}) {

    if (

        transactionType ===
        TransactionType.TRANSFER

        ||

        !transaction.merchantId

        ||

        !transaction.categoryId

        ||

        transaction.categoryAssignmentSource !==
        CategoryAssignmentSource.USER
    ) {
        return;
    }


    await tx.merchantMapping.upsert({

        where: {

            userId_merchantId: {

                userId,

                merchantId:
                transaction.merchantId,
            },
        },

        update: {

            categoryId:
            transaction.categoryId,

            source:
            MerchantMappingSource.USER,

            confidence:
                1,
        },

        create: {

            userId,

            merchantId:
            transaction.merchantId,

            categoryId:
            transaction.categoryId,

            source:
            MerchantMappingSource.USER,

            confidence:
                1,
        },
    });
}


/*
 * --------------------------------------------------------------------------
 * Ledger
 * --------------------------------------------------------------------------
 */

export async function postLedgerEntries({
                                            tx,
                                            userId,
                                            transaction,
                                            amount,
                                        }: {
    tx: Prisma.TransactionClient;
    userId: string;

    transaction:
        Prisma.TransactionGetPayload<{}>;

    amount:
        Prisma.Decimal;
}) {

    const shouldPostLedger =

        (
            transaction.type ===
            TransactionType.INCOME &&

            transaction.destinationAccountId
        )

        ||

        (
            (
                transaction.type ===
                TransactionType.EXPENSE

                ||

                transaction.type ===
                TransactionType.INVESTMENT
            )

            &&

            transaction.sourceAccountId
        )

        ||

        (
            transaction.type ===
            TransactionType.TRANSFER

            &&

            transaction.sourceAccountId

            &&

            transaction.destinationAccountId
        );


    if (!shouldPostLedger) {
        return;
    }


    await postTransactionToLedger(
        tx,

        userId,

        transaction,

        amount,
    );
}


export async function deleteLedgerEntries({
                                              tx,
                                              transactionId,
                                          }: {
    tx: Prisma.TransactionClient;
    transactionId: string;
}) {

    await tx.ledgerEntry.deleteMany({

        where: {
            transactionId,
        },
    });
}


/*
 * --------------------------------------------------------------------------
 * Transaction update resolution
 * --------------------------------------------------------------------------
 */

export type ResolvedTransactionUpdate = {

    merchantId:
        string | null;

    merchantRaw:
        string | null;

    merchantNormalized:
        string | null;

    categoryId:
        string | null;

    categoryAssignmentSource:
        CategoryAssignmentSource;

    aiCategoryConfidence:
        number | null;
};


export async function resolveTransactionUpdate({

                                                   userId,

                                                   existing,

                                                   data,

                                               }: {

    userId: string;

    existing:
        TransactionWithRelations;

    data: {

        type:
            TransactionType;

        merchant?:
            string | null;

        categoryId?:
            string | null;
    };

}): Promise<ResolvedTransactionUpdate> {

    void userId;


    /*
     * ----------------------------------------------------------------------
     * Explicit merchant update
     * ----------------------------------------------------------------------
     *
     * Manual merchant input is authoritative.
     */

    if (
        data.merchant !==
        undefined
    ) {

        const merchantRaw =
            data.merchant?.trim() ||
            null;


        /*
         * User cleared merchant.
         */

        if (!merchantRaw) {

            return {

                merchantId:
                    null,

                merchantRaw:
                    null,

                merchantNormalized:
                    null,

                categoryId:
                    data.type ===
                    TransactionType.TRANSFER

                        ? null

                        : data.categoryId ??
                        existing.categoryId,

                categoryAssignmentSource:
                    data.type ===
                    TransactionType.TRANSFER

                        ? CategoryAssignmentSource.USER

                        : data.categoryId != null

                            ? CategoryAssignmentSource.USER

                            : existing.categoryAssignmentSource,

                aiCategoryConfidence:
                    data.categoryId !==
                    undefined

                        ? null

                        : existing.aiCategoryConfidence,
            };
        }


        /*
         * Manual merchant.
         *
         * Do not normalize.
         * Do not resolve with AI.
         * Do not resolve aliases.
         */

        const merchant =
            await prisma.merchant.upsert({

                where: {
                    name:
                    merchantRaw,
                },

                update: {},

                create: {
                    name:
                    merchantRaw,
                },
            });


        const categoryId =
            data.type ===
            TransactionType.TRANSFER

                ? null

                : data.categoryId !==
                undefined

                    ? data.categoryId

                    : existing.categoryId;


        return {

            merchantId:
            merchant.id,

            merchantRaw,

            merchantNormalized:
            merchant.name,

            categoryId,

            categoryAssignmentSource:
                data.type ===
                TransactionType.TRANSFER

                    ? CategoryAssignmentSource.USER

                    : data.categoryId !==
                    undefined

                        ? CategoryAssignmentSource.USER

                        : existing.categoryAssignmentSource,

            aiCategoryConfidence:
                data.categoryId !==
                undefined

                    ? null

                    : existing.aiCategoryConfidence,
        };
    }


    /*
     * ----------------------------------------------------------------------
     * Explicit category update
     * ----------------------------------------------------------------------
     */

    if (
        data.categoryId !==
        undefined
    ) {

        return {

            merchantId:
            existing.merchantId,

            merchantRaw:
            existing.merchantRaw,

            merchantNormalized:
            existing.merchantNormalized,

            categoryId:
                data.type ===
                TransactionType.TRANSFER

                    ? null

                    : data.categoryId,

            categoryAssignmentSource:
            CategoryAssignmentSource.USER,

            aiCategoryConfidence:
                null,
        };
    }


    /*
     * ----------------------------------------------------------------------
     * No merchant/category change
     * ----------------------------------------------------------------------
     */

    if (
        data.type ===
        existing.type
    ) {

        return {

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


    /*
     * ----------------------------------------------------------------------
     * Transaction type changed
     * ----------------------------------------------------------------------
     */

    const existingCategoryIsValid =
        existing.category?.type ===
        data.type;


    return {

        merchantId:
        existing.merchantId,

        merchantRaw:
        existing.merchantRaw,

        merchantNormalized:
        existing.merchantNormalized,

        categoryId:
            data.type ===
            TransactionType.TRANSFER

                ? null

                : existingCategoryIsValid

                    ? existing.categoryId

                    : null,

        categoryAssignmentSource:
            data.type ===
            TransactionType.TRANSFER

                ? CategoryAssignmentSource.USER

                : existingCategoryIsValid

                    ? existing.categoryAssignmentSource

                    : CategoryAssignmentSource.NONE,

        aiCategoryConfidence:
            data.type ===
            TransactionType.TRANSFER

            ||

            !existingCategoryIsValid

                ? null

                : existing.aiCategoryConfidence,
    };
}


/*
 * --------------------------------------------------------------------------
 * Sorting
 * --------------------------------------------------------------------------
 */

export const getTransactionOrderBy = (
    sortBy: TransactionSortBy,
    order: SortOrder,
): Prisma.TransactionOrderByWithRelationInput => {

    switch (sortBy) {

        case "amount":

            return {
                amount:
                order,
            };


        case "createdAt":

            return {
                createdAt:
                order,
            };


        case "merchant":

            return {

                merchant: {
                    name:
                    order,
                },
            };


        case "category":

            return {

                category: {
                    name:
                    order,
                },
            };


        case "date":

        default:

            return {
                date:
                order,
            };
    }
};