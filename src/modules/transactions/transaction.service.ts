import {prisma} from "../../database/prisma";
import {CategoryAssignmentSource, MerchantMappingSource, Prisma, TransactionType} from "@prisma/client";
import {postTransactionToLedger} from "../ledger/ledger.service";
import {categorizeMerchant, learnMerchantCategory, resolveMerchant} from "../merchant/merchant.service";
import {needsCategoryReview} from "../merchant/merchant.review";

const serialize = <T>(obj: T): T =>
    JSON.parse(
        JSON.stringify(obj, (_, v) =>
            v instanceof Prisma.Decimal ? v.toString() : v
        )
    ) as T;
const mapTransaction = <
    T extends {
        categoryAssignmentSource: CategoryAssignmentSource;
        aiCategoryConfidence: number | null;
        merchant?: {
            id: string;
            name: string;
        } | null;
        category?: {
            name: string;
        } | null;
    }
>(
    trx: T,
) => ({
    ...trx,
    needsCategoryReview: needsCategoryReview({
        assignmentSource: trx.categoryAssignmentSource,
        confidence: trx.aiCategoryConfidence,
        categoryName: trx.category?.name,
    }),
});

const transactionInclude = {
    category: true,
    merchant: true,
    sourceAccount: true,
    destinationAccount: true,
} satisfies Prisma.TransactionInclude;

export const updateAnalytics = async (
    tx: Prisma.TransactionClient,
    userId: string,
    year: number,
    month: number,
    type: TransactionType,
    amount: Prisma.Decimal,
    op: "increment" | "decrement"
) => {
    if (type === TransactionType.TRANSFER) return;

    const updateData: Prisma.MonthlyAnalyticsUpdateInput = {};

    if (type === TransactionType.INCOME) {
        updateData.totalIncome = {[op]: amount};
    } else if (type === TransactionType.EXPENSE) {
        updateData.totalExpense = {[op]: amount};
    } else if (type === TransactionType.INVESTMENT) {
        updateData.totalInvestment = {[op]: amount};
    }

    await tx.monthlyAnalytics.upsert({
        where: {
            userId_year_month: {userId, year, month,},
        },
        update: updateData,
        create: {
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
        if (!data.type) {
            throw new Error("Transaction type required");
        }

        const amount = new Prisma.Decimal(data.amount);

        if (amount.lte(0)) {
            throw new Error("Amount must be > 0");
        }

        const date = new Date(data.date);

        if (isNaN(date.getTime())) {
            throw new Error("Invalid date");
        }

        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        /* ------------------------------------------------------------------ */
        /* Idempotency                                                        */
        /* ------------------------------------------------------------------ */

        if (data.idempotencyKey) {
            const existing = await tx.transaction.findUnique({
                where: {
                    idempotencyKey: data.idempotencyKey,
                },
            });

            if (existing) {
                const transaction = await tx.transaction.findUnique({
                    where: {
                        id: existing.id,
                    },
                    include: transactionInclude,
                });

                if (!transaction) {
                    throw new Error("Transaction not found");
                }

                return serialize(mapTransaction(transaction));
            }
        }

        /* ------------------------------------------------------------------ */
        /* Accounts                                                           */
        /* ------------------------------------------------------------------ */

        const findAccount = (accountId?: string) =>
            accountId
                ? tx.financialAccount.findFirst({
                    where: {
                        id: accountId,
                        userId,
                        deletedAt: null,
                        isArchived: false,
                    },
                })
                : Promise.resolve(null);

        const fromAccount = await findAccount(
            data.sourceAccountId,
        );

        const toAccount = await findAccount(
            data.destinationAccountId,
        );

        if (
            data.type === TransactionType.INCOME &&
            !toAccount
        ) {
            throw new Error(
                "Invalid destination account",
            );
        }

        if (
            (
                data.type ===
                TransactionType.EXPENSE ||
                data.type ===
                TransactionType.INVESTMENT
            ) &&
            !fromAccount
        ) {
            throw new Error(
                "Invalid source account",
            );
        }

        if (data.type === TransactionType.TRANSFER) {
            if (!fromAccount || !toAccount) {
                throw new Error(
                    "Both accounts are required",
                );
            }

            if (fromAccount.id === toAccount.id) {
                throw new Error(
                    "Cannot transfer to same account",
                );
            }
        }

        /* ------------------------------------------------------------------ */
        /* Merchant + Category                                                */
        /* ------------------------------------------------------------------ */

        let merchantId: string | null = null;
        let merchantRaw: string | null = null;

        let categoryId: string | null = data.categoryId ?? null;
        let categoryAssignmentSource: CategoryAssignmentSource =
            CategoryAssignmentSource.USER;
        let aiCategoryConfidence: number | null = null;

        if (data.merchant?.trim()) {
            merchantRaw = data.merchant.trim();

            const resolvedMerchant =
                await resolveMerchant(merchantRaw);

            merchantId = resolvedMerchant.merchant.id;

            if (
                data.type !== TransactionType.TRANSFER &&
                !categoryId
            ) {
                const categorization =
                    await categorizeMerchant({
                        userId,
                        merchant: resolvedMerchant.merchant,
                        transactionType: data.type,
                    });

                categoryId = categorization.category.id;
                categoryAssignmentSource =
                    categorization.categoryAssignmentSource;
                aiCategoryConfidence =
                    categorization.confidence;
            }
        }

        if (
            data.type !== TransactionType.TRANSFER &&
            !categoryId
        ) {
            throw new Error(
                "Either categoryId or merchant is required.",
            );
        }

        if (categoryId) {
            const category = await tx.category.findFirst({
                where: {
                    id: categoryId,
                    userId,
                },
            });

            if (!category) {
                throw new Error("Invalid categoryId");
            }

            if (
                data.type !== TransactionType.TRANSFER &&
                category.type !== data.type
            ) {
                throw new Error(
                    "Category type does not match transaction type",
                );
            }
        }

        /* ------------------------------------------------------------------ */
        /* Create Transaction                                                 */
        /* ------------------------------------------------------------------ */

        const trx =
            await tx.transaction.create({
                data: {
                    userId,
                    type: data.type,
                    amount,
                    date,
                    year,
                    month,

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

                    merchantId,
                    merchantRaw,

                    sourceAccountId:
                        data.sourceAccountId ??
                        null,

                    destinationAccountId:
                        data.destinationAccountId ??
                        null,

                    note:
                        data.note ?? null,

                    idempotencyKey:
                        data.idempotencyKey ??
                        null,
                },
                include: transactionInclude,
            });

        if (
            trx.merchantId &&
            trx.categoryId &&
            data.type !== TransactionType.TRANSFER &&
            trx.categoryAssignmentSource === CategoryAssignmentSource.USER
        ) {
            await learnMerchantCategory(
                userId,
                trx.merchantId,
                trx.categoryId,
                MerchantMappingSource.USER,
            );
        }

        /* ------------------------------------------------------------------ */
        /* Ledger + Analytics                                                 */
        /* ------------------------------------------------------------------ */

        await postTransactionToLedger(tx, userId, trx, amount);
        await updateAnalytics(tx, userId, year, month, data.type, amount, "increment");
        return serialize(mapTransaction(trx),);
    });
};

export const deleteTransaction = async (
    userId: string,
    transactionId: string
) => {
    return prisma.$transaction(async tx => {
        const trx =
            await tx.transaction.findFirst(
                {
                    where: {
                        id: transactionId,
                        userId,
                        deletedAt: null,
                    },
                }
            );

        if (!trx) {
            throw new Error("Transaction not found");
        }

        await tx.ledgerEntry.deleteMany({
            where: {
                transactionId: trx.id,
            },
        });

        await updateAnalytics(tx, userId, trx.year, trx.month, trx.type, trx.amount, "decrement");

        const deleted = await tx.transaction.update({
            where: {
                id: trx.id,
            },
            data: {
                deletedAt: new Date(),
            },
            include: transactionInclude,
        });

        return serialize(mapTransaction(deleted));
    });
};

export const restoreTransaction = async (
    userId: string,
    transactionId: string
) => {
    return prisma.$transaction(async tx => {
        const trx =
            await tx.transaction.findFirst(
                {
                    where: {
                        id: transactionId,
                        userId,
                        deletedAt: {
                            not: null,
                        },
                    },
                }
            );

        if (!trx) {
            throw new Error("Transaction not found");
        }

        const restored = await tx.transaction.update({
            where: {
                id: trx.id,
            },
            data: {
                deletedAt: null,
            },
            include: transactionInclude,
        });

        await postTransactionToLedger(
            tx,
            userId,
            trx,
            trx.amount
        );

        await updateAnalytics(
            tx,
            userId,
            trx.year,
            trx.month,
            trx.type,
            trx.amount,
            "increment"
        );

        return serialize(
            mapTransaction(restored)
        );
    });
};

export const getRecentTransactions = async (
    userId: string,
    limit = 5
) => {
    const trx = await prisma.transaction.findMany({
        where: {
            userId,
            deletedAt: null,
        },
        include: transactionInclude,
        orderBy: {
            date: "desc",
        },
        take: limit,
    });

    return serialize(
        trx.map(mapTransaction)
    );
};

export const getTransactions = async (
    userId: string
) => {
    const trx =
        await prisma.transaction.findMany({
            where: {
                userId,
                deletedAt: null,
            },
            include: transactionInclude,
            orderBy: {
                date: "desc",
            },
        });

    return serialize(
        trx.map(mapTransaction)
    );
};

export const getTransactionById = async (userId: string, transactionId: string) => {
    const trx = await prisma.transaction.findFirst({
        where: {
            id: transactionId,
            userId,
            deletedAt: null,
        },
        include: transactionInclude,
    });

    if (!trx) throw new Error("Transaction not found");
    return serialize(
        mapTransaction(trx)
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
    }
) => {
    return prisma.$transaction(async tx => {

        const existing = await tx.transaction.findFirst({
            where: {
                id: transactionId,
                userId,
                deletedAt: null,
            },
        });

        if (!existing) {
            throw new Error("Transaction not found");
        }

        if (!data.type) {
            throw new Error("Transaction type required");
        }

        const amount = new Prisma.Decimal(data.amount);

        if (amount.lte(0)) {
            throw new Error("Amount must be > 0");
        }

        const date = new Date(data.date);

        if (isNaN(date.getTime())) {
            throw new Error("Invalid date");
        }

        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        /* =============================
           ACCOUNT VALIDATION
        ============================== */

        const sourceAccountId =
            data.sourceAccountId ?? existing.sourceAccountId;

        const destinationAccountId =
            data.destinationAccountId ??
            existing.destinationAccountId;

        const findAccount = (accountId?: string | null) =>
            accountId
                ? tx.financialAccount.findFirst({
                    where: {
                        id: accountId,
                        userId,
                        deletedAt: null,
                        isArchived: false,
                    },
                })
                : Promise.resolve(null);

        const fromAccount = await findAccount(sourceAccountId);
        const toAccount = await findAccount(destinationAccountId);

        if (data.type === TransactionType.INCOME && !toAccount) {
            throw new Error("Invalid destination account");
        }

        if (
            (
                data.type === TransactionType.EXPENSE ||
                data.type === TransactionType.INVESTMENT
            ) &&
            !fromAccount
        ) {
            throw new Error("Invalid source account");
        }

        if (data.type === TransactionType.TRANSFER) {
            if (!fromAccount || !toAccount) {
                throw new Error("Both accounts are required");
            }

            if (fromAccount.id === toAccount.id) {
                throw new Error("Cannot transfer to same account");
            }
        }

        /* =============================
   CATEGORY VALIDATION
============================= */

        if (data.type === TransactionType.TRANSFER && data.categoryId) {
            throw new Error("Transfers cannot have categories");
        }

        let categoryId: string | null =
            data.categoryId ?? existing.categoryId;

        let categoryAssignmentSource: CategoryAssignmentSource =
            existing.categoryAssignmentSource;

        let aiCategoryConfidence: number | null =
            existing.aiCategoryConfidence;

        let merchantId = existing.merchantId;
        let merchantRaw = existing.merchantRaw;

        if (data.merchant !== undefined) {
            merchantRaw = data.merchant.trim() || null;

            if (merchantRaw) {
                const resolvedMerchant =
                    await resolveMerchant(merchantRaw);

                const newMerchantId = resolvedMerchant.merchant.id;
                const merchantChanged = newMerchantId !== existing.merchantId;
                merchantId = newMerchantId;
                const shouldRecategorize =
                    merchantChanged &&
                    !data.categoryId &&
                    existing.categoryAssignmentSource !== CategoryAssignmentSource.USER;
                if (shouldRecategorize) {
                    const result =
                        await categorizeMerchant({
                            userId,
                            merchant: resolvedMerchant.merchant,
                            transactionType: data.type,
                        });

                    categoryId = result.category.id;
                    categoryAssignmentSource =
                        result.categoryAssignmentSource;
                    aiCategoryConfidence =
                        result.confidence;
                }
            } else {
                merchantId = null;

                if (!data.categoryId) {
                    categoryAssignmentSource =
                        CategoryAssignmentSource.USER;

                    aiCategoryConfidence = null;
                }
            }
        }

        if (data.type !== TransactionType.TRANSFER) {
            if (data.categoryId) {
                categoryAssignmentSource =
                    CategoryAssignmentSource.USER;
                aiCategoryConfidence = null;
            }

            if (!categoryId) {
                throw new Error(
                    "Either categoryId or merchant is required.",
                );
            }

            const category = await tx.category.findFirst({
                where: {
                    id: categoryId,
                    userId,
                },
            });

            if (!category) {
                throw new Error("Invalid categoryId");
            }

            if (category.type !== data.type) {
                throw new Error("Category type does not match transaction type",);
            }
        }

        /* =============================
           REMOVE OLD ANALYTICS
        ============================== */

        await updateAnalytics(
            tx,
            userId,
            existing.year,
            existing.month,
            existing.type,
            existing.amount,
            "decrement"
        );


        /* =============================
           REMOVE OLD LEDGER
        ============================== */

        await tx.ledgerEntry.deleteMany({
            where: {
                transactionId: existing.id,
            },
        });

        /* =============================
           UPDATE TRANSACTION
        ============================== */
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
                categoryId: data.type === TransactionType.TRANSFER ? null : categoryId,
                categoryAssignmentSource: data.type === TransactionType.TRANSFER ? CategoryAssignmentSource.USER : categoryAssignmentSource,
                aiCategoryConfidence,
                merchantId,
                merchantRaw,
                sourceAccountId,
                destinationAccountId,
                note: data.note ?? existing.note,
            },
            include: transactionInclude,
        });
        /* =============================
           LEARN MERCHANT
        ============================== */

        const merchantChanged =
            updated.merchantId !== existing.merchantId;

        const categoryChanged =
            updated.categoryId !== existing.categoryId;

        if (
            updated.merchantId &&
            updated.categoryId &&
            updated.categoryAssignmentSource === CategoryAssignmentSource.USER &&
            data.type !== TransactionType.TRANSFER &&
            (merchantChanged || categoryChanged)
        ) {
            await learnMerchantCategory(
                userId,
                updated.merchantId,
                updated.categoryId,
                updated.categoryAssignmentSource === CategoryAssignmentSource.USER
                    ? MerchantMappingSource.USER
                    : MerchantMappingSource.AI
            );
        }

        /* =============================
           REBUILD LEDGER
        ============================== */

        await postTransactionToLedger(
            tx,
            userId,
            updated,
            amount
        );

        /* =============================
           APPLY ANALYTICS
        ============================== */

        await updateAnalytics(
            tx,
            userId,
            year,
            month,
            data.type,
            amount,
            "increment"
        );

        return serialize(
            mapTransaction(updated)
        );
    });
};