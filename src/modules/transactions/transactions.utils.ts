import {CategoryAssignmentSource, MerchantMappingSource, Prisma, TransactionType,} from "@prisma/client";
import {resolveTransactionMerchant,} from "../merchant/merchant.service";
import {ResolveTransactionMerchantResult,} from "../merchant/merchant.types";
import {postTransactionToLedger,} from "../ledger/ledger.service";
import {transactionInclude, TransactionWithRelations} from "./transaction.constants";

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

    const decimalAmount = new Prisma.Decimal(amount);

    if (decimalAmount.lte(0)) {
        throw new Error(
            "Amount must be greater than zero.",
        );
    }

    const transactionDate = date instanceof Date
        ? date
        : new Date(date);
    if (Number.isNaN(transactionDate.getTime())) {
        throw new Error(
            "Invalid transaction date.",
        );
    }

    return {
        amount: decimalAmount,
        date: transactionDate,
        year: transactionDate.getFullYear(),
        month: transactionDate.getMonth() + 1,
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
    const transaction = await tx.transaction.findFirst({
        where: {
            id: transactionId,
            userId,
            deletedAt: null,
        },
        include: transactionInclude,
    });

    if (!transaction) {
        throw new Error("Transaction not found.");
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

    const [sourceAccount, destinationAccount] =
        await Promise.all([
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

    if (type === TransactionType.TRANSFER) {
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

    return resolveTransactionMerchant({

        userId,

        merchantRaw,

        transactionType,

        shouldCategorize:
            transactionType !==
            TransactionType.TRANSFER &&
            !categoryId,

    });
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
        categoryAssignmentSource: CategoryAssignmentSource;
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
                merchantId: transaction.merchantId,
            },
        },
        update: {
            categoryId: transaction.categoryId,
            source: MerchantMappingSource.USER,
            confidence: 1,
        },
        create: {
            userId,
            merchantId: transaction.merchantId,
            categoryId: transaction.categoryId,
            source: MerchantMappingSource.USER,
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
    transaction: Prisma.TransactionGetPayload<{}>;
    amount: Prisma.Decimal;
}) {

    const shouldPostLedger =

        (
            transaction.type === TransactionType.INCOME &&
            transaction.destinationAccountId
        ) ||

        (
            (
                transaction.type === TransactionType.EXPENSE ||
                transaction.type === TransactionType.INVESTMENT
            ) &&
            transaction.sourceAccountId
        ) ||

        (
            transaction.type === TransactionType.TRANSFER &&
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

export type ResolvedTransactionUpdate = {
    merchantId: string | null;
    merchantRaw: string | null;
    merchantNormalized: string | null;
    categoryId: string | null;
    categoryAssignmentSource: CategoryAssignmentSource;
    aiCategoryConfidence: number | null;
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
     * Merchant was explicitly changed.
     *
     * This must take priority over categoryId because updateTransaction()
     * passes the merged/existing categoryId even when the user only changes
     * the merchant.
     */
    if (data.merchant !== undefined) {

        const merchantRaw =
            data.merchant?.trim() || null;

        /*
         * Merchant was cleared.
         */
        if (!merchantRaw) {
            return {
                merchantId: null,
                merchantRaw: null,
                merchantNormalized: null,

                categoryId:
                    data.type === TransactionType.TRANSFER
                        ? null
                        : data.categoryId ?? null,

                categoryAssignmentSource:
                    data.type === TransactionType.TRANSFER
                        ? CategoryAssignmentSource.USER
                        : data.categoryId
                            ? CategoryAssignmentSource.USER
                            : CategoryAssignmentSource.NONE,

                aiCategoryConfidence: null,
            };
        }

        /*
         * Resolve the new merchant outside the Prisma transaction.
         */
        const merchant =
            await resolveTransactionMerchant({
                userId,
                merchantRaw,
                transactionType: data.type,
                shouldCategorize:
                    data.type !== TransactionType.TRANSFER &&
                    data.categoryId == null,
            });

        /*
         * If the user explicitly supplied a category, that category wins.
         * Otherwise use the merchant resolver's category.
         */
        const categoryId =
            data.type === TransactionType.TRANSFER
                ? null
                : data.categoryId ?? merchant.categoryId;

        const categoryAssignmentSource =
            data.type === TransactionType.TRANSFER
                ? CategoryAssignmentSource.USER
                : data.categoryId != null
                    ? CategoryAssignmentSource.USER
                    : merchant.categoryAssignmentSource;

        const aiCategoryConfidence =
            data.type === TransactionType.TRANSFER ||
            data.categoryId != null
                ? null
                : merchant.confidence;

        return {
            merchantId: merchant.merchantId,
            merchantRaw: merchant.merchantRaw,
            merchantNormalized: merchant.merchantNormalized,

            categoryId,

            categoryAssignmentSource,

            aiCategoryConfidence,
        };
    }

    /*
     * No merchant change.
     *
     * If an explicit category was supplied, use it.
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
                data.type === TransactionType.TRANSFER
                    ? null
                    : data.categoryId,

            categoryAssignmentSource:
                data.type === TransactionType.TRANSFER
                    ? CategoryAssignmentSource.USER
                    : CategoryAssignmentSource.USER,

            aiCategoryConfidence: null,
        };
    }

    /*
     * Nothing merchant/category-related changed and transaction
     * type is unchanged.
     */
    if (data.type === existing.type) {
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
     * Transaction type changed but merchant did not.
     *
     * Preserve the existing category only if it belongs to
     * the new transaction type.
     */
    const existingCategoryIsValid =
        existing.category?.type === data.type;

    return {
        merchantId:
        existing.merchantId,

        merchantRaw:
        existing.merchantRaw,

        merchantNormalized:
        existing.merchantNormalized,

        categoryId:
            data.type === TransactionType.TRANSFER
                ? null
                : existingCategoryIsValid
                    ? existing.categoryId
                    : null,

        categoryAssignmentSource:
            data.type === TransactionType.TRANSFER
                ? CategoryAssignmentSource.USER
                : existingCategoryIsValid
                    ? existing.categoryAssignmentSource
                    : CategoryAssignmentSource.NONE,

        aiCategoryConfidence:
            data.type === TransactionType.TRANSFER ||
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
