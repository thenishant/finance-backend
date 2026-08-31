import {CategoryAssignmentSource, MerchantMappingSource, Prisma, TransactionType,} from "@prisma/client";

import {resolveManualTransactionMerchant,} from "../merchant/merchant.service";

import {ResolveTransactionMerchantResult,} from "../merchant/merchant.types";

import {postTransactionToLedger,} from "../ledger/ledger.service";

import {transactionInclude, TransactionWithRelations,} from "./transaction.constants";
import {prisma} from "../../database/prisma";


export type TransactionSortBy =
    | "date"
    | "createdAt"
    | "amount";

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
        amount: decimalAmount,
        date: transactionDate,
        year: transactionDate.getFullYear(),
        month:
            transactionDate.getMonth() + 1,
    };
}


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

    return await tx.transaction.findUnique({
        where: {
            idempotencyKey,
        },
        include: transactionInclude,
    });
}


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
                id: transactionId,
                userId,
                deletedAt: null,
            },
            include: transactionInclude,
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
                id: transactionId,
                userId,
                deletedAt: {
                    not: null,
                },
            },
            include: transactionInclude,
        });

    if (!transaction) {
        throw new Error(
            "Transaction not found.",
        );
    }

    return transaction;
}


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
                deletedAt: null,
                isArchived: false,
            },
        });
    };

    const [
        sourceAccount,
        destinationAccount,
    ] = await Promise.all([
        findAccount(sourceAccountId),
        findAccount(destinationAccountId),
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
                id: categoryId,
                userId,
            },
        });

    if (!category) {
        throw new Error(
            "Invalid category.",
        );
    }

    if (category.type !== type) {
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
 * Manual transactions NEVER use:
 *
 * - normalizeMerchantName()
 * - resolveMerchant()
 * - resolveMerchantWithAI()
 * - categorizeMerchant()
 * - categorizeMerchantWithAI()
 *
 * The user's merchant value is authoritative.
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

    const raw = merchantRaw?.trim();

    /*
     * No merchant.
     */
    if (!raw) {
        return {
            merchant: null,
            merchantId: null,
            merchantRaw: null,
            merchantNormalized: null,
            category: null,
            categoryId: null,
            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,
            confidence: null,
        };
    }

    /*
     * MANUAL TRANSACTION
     *
     * The transaction creation flow is manual, therefore
     * the merchant supplied by the user is authoritative.
     *
     * NEVER call:
     *
     *   resolveTransactionMerchant()
     *   resolveMerchant()
     *   resolveMerchantWithAI()
     *   normalizeMerchantName()
     *
     * here.
     */
    const merchant =
        await prisma.merchant.upsert({
            where: {
                name: raw,
            },

            update: {},

            create: {
                name: raw,
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

        /*
         * The category is supplied separately by
         * createTransaction().
         */
        category: null,

        categoryId: null,

        /*
         * If the user supplied a category, createTransaction()
         * will mark it USER.
         *
         * Otherwise there is simply no category.
         */
        categoryAssignmentSource:
            categoryId != null
                ? CategoryAssignmentSource.USER
                : CategoryAssignmentSource.NONE,

        confidence: null,
    };
}

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
    transactionType: TransactionType;
}) {

    if (
        transactionType ===
        TransactionType.TRANSFER ||
        !transaction.merchantId ||
        !transaction.categoryId ||
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

            confidence: 1,
        },

        create: {
            userId,

            merchantId:
            transaction.merchantId,

            categoryId:
            transaction.categoryId,

            source:
            MerchantMappingSource.USER,

            confidence: 1,
        },
    });
}


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
    amount: Prisma.Decimal;
}) {

    const shouldPostLedger =

        (
            transaction.type ===
            TransactionType.INCOME &&
            transaction.destinationAccountId
        ) ||

        (
            (
                transaction.type ===
                TransactionType.EXPENSE ||

                transaction.type ===
                TransactionType.INVESTMENT
            ) &&
            transaction.sourceAccountId
        ) ||

        (
            transaction.type ===
            TransactionType.TRANSFER &&

            transaction.sourceAccountId &&
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
 * Transaction update merchant resolution
 * --------------------------------------------------------------------------
 */

export type ResolvedTransactionUpdate = {
    merchantId: string | null;
    merchantRaw: string | null;
    merchantNormalized: string | null;

    categoryId: string | null;

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
    existing: TransactionWithRelations;

    data: {
        type: TransactionType;
        merchant?: string | null;
        categoryId?: string | null;
    };
}): Promise<ResolvedTransactionUpdate> {

    /*
     * ----------------------------------------------------------------------
     * Merchant explicitly changed
     * ----------------------------------------------------------------------
     *
     * This is a MANUAL merchant change.
     *
     * The user entered the merchant directly.
     *
     * Therefore:
     *
     * - no AI
     * - no alias lookup
     * - no semantic normalization
     *
     * Only trim surrounding whitespace.
     */
    if (data.merchant !== undefined) {

        const merchantRaw =
            data.merchant?.trim() || null;

        /*
         * User cleared merchant.
         */
        if (!merchantRaw) {

            return {
                merchantId: null,

                merchantRaw: null,

                merchantNormalized: null,

                categoryId:
                    data.type ===
                    TransactionType.TRANSFER
                        ? null
                        : data.categoryId ?? null,

                categoryAssignmentSource:
                    data.type ===
                    TransactionType.TRANSFER
                        ? CategoryAssignmentSource.USER
                        : data.categoryId != null
                            ? CategoryAssignmentSource.USER
                            : CategoryAssignmentSource.NONE,

                aiCategoryConfidence:
                    null,
            };
        }

        /*
         * IMPORTANT:
         *
         * Do NOT call normalizeMerchantName()
         * here.
         *
         * For example:
         *
         * "Credit Card Transfer"
         *
         * must remain:
         *
         * "Credit Card Transfer"
         *
         * rather than becoming:
         *
         * "Transfer"
         */
        const merchant =
            await prisma.merchant.upsert({
                where: {
                    name: merchantRaw,
                },

                update: {},

                create: {
                    name: merchantRaw,
                },
            });

        /*
         * Explicit category wins.
         *
         * Transfers never have categories.
         */
        const categoryId =
            data.type ===
            TransactionType.TRANSFER
                ? null
                : data.categoryId ?? null;

        const categoryAssignmentSource =
            data.type ===
            TransactionType.TRANSFER
                ? CategoryAssignmentSource.USER
                : data.categoryId != null
                    ? CategoryAssignmentSource.USER
                    : CategoryAssignmentSource.NONE;

        return {
            merchantId:
            merchant.id,

            merchantRaw,

            merchantNormalized:
            merchant.name,

            categoryId,

            categoryAssignmentSource,

            /*
             * Manual merchant changes never
             * have AI confidence.
             */
            aiCategoryConfidence:
                null,
        };
    }


    /*
     * ----------------------------------------------------------------------
     * Category explicitly changed
     * ----------------------------------------------------------------------
     */

    if (data.categoryId !== undefined) {

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
     * Nothing merchant/category-related changed
     * ----------------------------------------------------------------------
     */

    if (
        data.type === existing.type
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
            TransactionType.TRANSFER ||
            !existingCategoryIsValid
                ? null
                : existing.aiCategoryConfidence,
    };
}


export function getTransactionOrderBy(
    sortBy: TransactionSortBy = "date",
    order: SortOrder = "desc",
): Prisma.TransactionOrderByWithRelationInput {

    switch (sortBy) {

        case "createdAt":
            return {
                createdAt: order,
            };

        case "amount":
            return {
                amount: order,
            };

        case "date":
        default:
            return {
                date: order,
            };
    }
}