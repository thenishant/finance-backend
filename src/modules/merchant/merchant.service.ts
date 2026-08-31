import {Category, CategoryAssignmentSource, Merchant, MerchantMappingSource, TransactionType,} from "@prisma/client";

import {prisma} from "../../database/prisma";

import {
    CategorizeMerchantInput,
    MerchantCategorizationResult,
    MerchantCategoryOption,
    MerchantResolution,
    ResolveTransactionMerchantResult,
} from "./merchant.types";

import {categorizeMerchantWithAI, resolveMerchantWithAI,} from "./merchant.ai";

import {normalizeMerchantName} from "./merchant.normalizer";

/* -------------------------------------------------------------------------- */
/*                         In-flight request caches                            */
/* -------------------------------------------------------------------------- */

const resolvingMerchants =
    new Map<
        string,
        Promise<MerchantResolution>
    >();

const categorizingMerchants =
    new Map<
        string,
        Promise<MerchantCategorizationResult>
    >();

/* -------------------------------------------------------------------------- */
/*                              Category Helpers                              */
/* -------------------------------------------------------------------------- */

export const getMerchantCategoryOptions = async (
    userId: string,
    transactionType: TransactionType,
): Promise<MerchantCategoryOption[]> => {
    const categories =
        await prisma.category.findMany({
            where: {
                userId,
                type: transactionType,
            },

            orderBy: {
                name: "asc",
            },
        });

    const byId =
        new Map<string, Category>();

    for (const category of categories) {
        byId.set(
            category.id,
            category,
        );
    }

    const hasChildren =
        new Set<string>();

    for (const category of categories) {
        if (category.parentId) {
            hasChildren.add(
                category.parentId,
            );
        }
    }

    const buildPath = (
        category: Category,
    ): string => {
        const path: string[] = [];

        let current:
            | Category
            | undefined = category;

        while (current) {
            path.unshift(
                current.name,
            );

            current =
                current.parentId
                    ? byId.get(
                        current.parentId,
                    )
                    : undefined;
        }

        return path.join(" > ");
    };

    return categories
        .filter(
            category =>
                !hasChildren.has(
                    category.id,
                ),
        )
        .sort((a, b) =>
            buildPath(a).localeCompare(
                buildPath(b),
            ),
        )
        .map(category => ({
            id: category.id,
            name: category.name,
            path: buildPath(category),
            type: category.type,
        }));
};

export const getCategoryById = (
    userId: string,
    categoryId: string,
) => {
    return prisma.category.findFirst({
        where: {
            id: categoryId,
            userId,
        },
    });
};

/* -------------------------------------------------------------------------- */
/*                              Merchant CRUD                                 */
/* -------------------------------------------------------------------------- */

export const findMerchantById = (
    merchantId: string,
) => {
    return prisma.merchant.findUnique({
        where: {
            id: merchantId,
        },

        include: {
            aliases: true,
        },
    });
};

export const findMerchantByName = (
    name: string,
) => {
    return prisma.merchant.findUnique({
        where: {
            name,
        },

        include: {
            aliases: true,
        },
    });
};

export const findMerchantByAlias = (
    alias: string,
) => {
    return prisma.merchantAlias.findUnique({
        where: {
            alias,
        },

        include: {
            merchant: {
                include: {
                    aliases: true,
                },
            },
        },
    });
};

export const getOrCreateMerchant = async (
    name: string,
): Promise<Merchant> => {
    return prisma.merchant.upsert({
        where: {
            name,
        },

        update: {},

        create: {
            name,
        },
    });
};

export const addAliasIfMissing = (
    merchantId: string,
    alias: string,
) => {
    return prisma.merchantAlias.upsert({
        where: {
            alias,
        },

        update: {},

        create: {
            merchantId,
            alias,
        },
    });
};

/* -------------------------------------------------------------------------- */
/*                           Merchant Resolution                              */
/* -------------------------------------------------------------------------- */

const resolveMerchantInternal = async (
    merchantName: string,
    normalizedName: string,
): Promise<MerchantResolution> => {
    /*
     * 1. Check canonical merchant name.
     */
    const exactMerchant =
        await findMerchantByName(
            normalizedName,
        );

    if (exactMerchant) {
        return {
            merchant: exactMerchant,
            normalizedName:
            exactMerchant.name,
            confidence: 1,
            fromCache: true,
        };
    }

    /*
     * 2. Check known alias.
     */
    const alias =
        await findMerchantByAlias(
            normalizedName,
        );

    if (alias) {
        return {
            merchant:
            alias.merchant,
            normalizedName:
            alias.merchant.name,
            confidence: 1,
            fromCache: true,
        };
    }

    /*
     * 3. AI resolution.
     */
    try {
        console.info(
            "[Merchant] Calling AI",
            {
                merchant:
                merchantName,
            },
        );

        const aiResult =
            await resolveMerchantWithAI(
                merchantName,
            );

        const canonicalName =
            normalizeMerchantName(
                aiResult.merchant,
            );

        if (!canonicalName) {
            throw new Error(
                "AI returned an invalid merchant.",
            );
        }

        const merchant =
            await getOrCreateMerchant(
                canonicalName,
            );

        /*
         * Remember the original normalized
         * transaction value as an alias.
         */
        await addAliasIfMissing(
            merchant.id,
            normalizedName,
        );

        console.info(
            "[Merchant] AI resolved",
            {
                original:
                merchantName,

                merchant:
                merchant.name,

                confidence:
                aiResult.confidence,
            },
        );

        return {
            merchant,

            normalizedName:
            merchant.name,

            confidence:
            aiResult.confidence,

            fromCache: false,
        };
    } catch (error) {
        /*
         * AI failed.
         *
         * Do not lose the merchant.
         *
         * Use the normalized transaction value
         * as the fallback merchant.
         */
        console.error(
            "[Merchant] AI resolution failed",
            {
                merchant:
                merchantName,

                normalizedMerchant:
                normalizedName,

                message:
                    error instanceof Error
                        ? error.message
                        : String(error),

                error,
            },
        );

        const fallbackMerchant =
            await getOrCreateMerchant(
                normalizedName,
            );

        /*
         * Remember this normalized value
         * so future transactions can resolve
         * without calling AI again.
         */
        await addAliasIfMissing(
            fallbackMerchant.id,
            normalizedName,
        );

        console.info(
            "[Merchant] Using fallback merchant",
            {
                original:
                merchantName,

                merchant:
                fallbackMerchant.name,
            },
        );

        return {
            merchant:
            fallbackMerchant,

            normalizedName:
            fallbackMerchant.name,

            confidence: 0,

            fromCache: false,
        };
    }
};

export const resolveMerchant = async (
    merchantName: string,
): Promise<MerchantResolution> => {
    const normalizedName =
        normalizeMerchantName(
            merchantName,
        );

    if (!normalizedName) {
        throw new Error(
            "Unable to normalize merchant name.",
        );
    }

    /*
     * Check for an existing in-flight request.
     */
    const existing =
        resolvingMerchants.get(
            normalizedName,
        );

    if (existing) {
        return existing;
    }

    /*
     * Create the promise before putting it
     * into the map.
     *
     * This gives concurrent callers the exact
     * same promise.
     */
    const promise =
        resolveMerchantInternal(
            merchantName,
            normalizedName,
        );

    resolvingMerchants.set(
        normalizedName,
        promise,
    );

    try {
        return await promise;
    } finally {
        /*
         * Only remove our own promise.
         */
        if (
            resolvingMerchants.get(
                normalizedName,
            ) === promise
        ) {
            resolvingMerchants.delete(
                normalizedName,
            );
        }
    }
};

/* -------------------------------------------------------------------------- */
/*                         Merchant Categorization                            */
/* -------------------------------------------------------------------------- */

export const categorizeMerchant = async ({
                                             userId,
                                             merchant,
                                             transactionType,
                                         }: CategorizeMerchantInput): Promise<MerchantCategorizationResult> => {
    const key =
        `${userId}:${merchant.id}:${transactionType}`;

    /*
     * Reuse an existing in-flight categorization.
     */
    const existing =
        categorizingMerchants.get(
            key,
        );

    if (existing) {
        console.info(
            "[Merchant] Waiting for in-flight categorization",
            {
                merchant:
                merchant.name,
            },
        );

        return existing;
    }

    const promise =
        (async (): Promise<MerchantCategorizationResult> => {
            /*
             * 1. Existing mapping.
             */
            const latestMapping =
                await prisma.merchantMapping.findUnique(
                    {
                        where: {
                            userId_merchantId: {
                                userId,
                                merchantId:
                                merchant.id,
                            },
                        },

                        include: {
                            category: true,
                        },
                    },
                );

            if (
                latestMapping &&
                latestMapping.category.type ===
                transactionType
            ) {
                return {
                    merchant,

                    category:
                    latestMapping.category,

                    confidence:
                        latestMapping.confidence ??
                        1,

                    reasoning:
                        "Previously categorized.",

                    fromCache: true,

                    categoryAssignmentSource:
                        latestMapping.source ===
                        MerchantMappingSource.USER
                            ? CategoryAssignmentSource.USER
                            : CategoryAssignmentSource.LEARNED,
                };
            }

            /*
             * 2. Available categories.
             */
            const categoryOptions =
                await getMerchantCategoryOptions(
                    userId,
                    transactionType,
                );

            if (
                categoryOptions.length ===
                0
            ) {
                throw new Error(
                    `No ${transactionType} categories found.`,
                );
            }

            /*
             * 3. AI categorization.
             */
            console.info(
                "[Merchant] Categorizing",
                {
                    merchant:
                    merchant.name,

                    transactionType,
                },
            );

            const aiResult =
                await categorizeMerchantWithAI(
                    merchant.name,
                    transactionType,
                    categoryOptions,
                );

            /*
             * 4. Validate AI category.
             */
            const category =
                await getCategoryById(
                    userId,
                    aiResult.categoryId,
                );

            if (!category) {
                throw new Error(
                    "AI returned an invalid category.",
                );
            }

            /*
             * Make sure the category belongs to
             * the current transaction type.
             */
            if (
                category.type !==
                transactionType
            ) {
                throw new Error(
                    "AI returned an invalid category.",
                );
            }

            console.info(
                "[Merchant] AI categorized",
                {
                    merchant:
                    merchant.name,

                    category:
                    category.name,

                    confidence:
                    aiResult.confidence,
                },
            );

            /*
             * 5. Learn the mapping.
             */
            await learnMerchantCategory(
                userId,
                merchant.id,
                category.id,
                MerchantMappingSource.AI,
                aiResult.confidence,
            );

            return {
                merchant,

                category,

                /*
                 * Preserve exact AI confidence,
                 * including 0.
                 */
                confidence:
                aiResult.confidence,

                reasoning:
                aiResult.reasoning,

                fromCache: false,

                categoryAssignmentSource:
                CategoryAssignmentSource.AI,
            };
        })();

    categorizingMerchants.set(
        key,
        promise,
    );

    try {
        return await promise;
    } finally {
        /*
         * Only delete our own promise.
         */
        if (
            categorizingMerchants.get(
                key,
            ) === promise
        ) {
            categorizingMerchants.delete(
                key,
            );
        }
    }
};

/* -------------------------------------------------------------------------- */
/*                         Merchant Category Learning                         */
/* -------------------------------------------------------------------------- */

export const learnMerchantCategory = async (
    userId: string,
    merchantId: string,
    categoryId: string,
    source: MerchantMappingSource,
    confidence = 1,
) => {
    /*
     * Never overwrite a user's explicit mapping
     * with AI.
     */
    if (
        source ===
        MerchantMappingSource.AI
    ) {
        const existing =
            await prisma.merchantMapping.findUnique(
                {
                    where: {
                        userId_merchantId: {
                            userId,
                            merchantId,
                        },
                    },
                },
            );

        if (
            existing &&
            existing.source ===
            MerchantMappingSource.USER
        ) {
            console.info(
                "[Merchant] Preserving USER mapping",
                {
                    merchantId,
                },
            );

            return;
        }
    }

    await prisma.merchantMapping.upsert({
        where: {
            userId_merchantId: {
                userId,
                merchantId,
            },
        },

        update: {
            categoryId,
            source,
            confidence,
        },

        create: {
            userId,
            merchantId,
            categoryId,
            source,
            confidence,
        },
    });

    console.info(
        "[Merchant] Mapping learned",
        {
            merchantId,
            categoryId,
            source,
            confidence,
        },
    );
};

/* -------------------------------------------------------------------------- */
/*                      Transaction Merchant Resolution                       */
/* -------------------------------------------------------------------------- */

export const resolveTransactionMerchant = async ({
                                                     userId,
                                                     merchantRaw,
                                                     transactionType,
                                                     shouldCategorize = true,
                                                     requireCategory = false,
                                                 }: {
    userId: string;

    merchantRaw?: string | null;

    transactionType: TransactionType;

    /*
     * Whether categorization should be attempted.
     */
    shouldCategorize?: boolean;

    /*
     * Whether categorization failure should fail
     * the entire operation.
     *
     * IMPORTANT:
     *
     * Gmail should pass false here.
     *
     * This allows a transaction to be persisted
     * even when the external AI provider is down.
     */
    requireCategory?: boolean;
}): Promise<ResolveTransactionMerchantResult> => {
    const raw =
        merchantRaw?.trim();

    /*
     * No merchant supplied.
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

    let resolvedMerchant:
        MerchantResolution;

    try {
        resolvedMerchant =
            await resolveMerchant(
                raw,
            );
    } catch (error) {
        console.error(
            "[Merchant] Failed to resolve merchant",
            {
                merchant: raw,
                error,
            },
        );

        /*
         * Merchant resolution itself failed.
         *
         * If the caller requires the merchant/category
         * operation to be fatal, preserve that behavior.
         */
        if (requireCategory) {
            throw error;
        }

        /*
         * Otherwise preserve the raw merchant information
         * and allow the transaction to continue.
         */
        return {
            merchant: null,

            merchantId: null,

            merchantRaw: raw,

            merchantNormalized:
                normalizeMerchantName(
                    raw,
                ),

            category: null,

            categoryId: null,

            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,

            confidence: null,
        };
    }

    /*
     * Transfers should never be categorized.
     *
     * Merchant resolution is still performed because
     * the transaction may have a useful merchant.
     */
    if (
        !shouldCategorize ||
        transactionType ===
        TransactionType.TRANSFER
    ) {
        return {
            merchant:
            resolvedMerchant.merchant,

            merchantId:
            resolvedMerchant.merchant.id,

            merchantRaw: raw,

            merchantNormalized:
            resolvedMerchant.normalizedName,

            category: null,

            categoryId: null,

            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,

            confidence:
            resolvedMerchant.confidence,
        };
    }

    try {
        const categorization =
            await categorizeMerchant({
                userId,

                merchant:
                resolvedMerchant.merchant,

                transactionType,
            });

        /*
         * Defensive invariant:
         *
         * A successful categorization MUST have
         * a category ID.
         */
        if (
            !categorization.category?.id
        ) {
            throw new Error(
                `Merchant categorization returned no category for "${raw}".`,
            );
        }

        return {
            merchant:
            resolvedMerchant.merchant,

            merchantId:
            resolvedMerchant.merchant.id,

            merchantRaw: raw,

            merchantNormalized:
            resolvedMerchant.normalizedName,

            category:
            categorization.category,

            categoryId:
            categorization.category.id,

            categoryAssignmentSource:
            categorization.categoryAssignmentSource,

            confidence:
            categorization.confidence,
        };
    } catch (error) {
        console.error(
            "[Merchant] Failed to categorize merchant",
            {
                merchant:
                resolvedMerchant.merchant.name,

                transactionType,

                message:
                    error instanceof Error
                        ? error.message
                        : String(error),

                error,
            },
        );

        /*
         * IMPORTANT:
         *
         * Categorization is enrichment.
         *
         * If the AI provider is unavailable, the merchant
         * is still valid and the transaction should still
         * be persisted.
         */
        if (requireCategory) {
            throw error;
        }

        /*
         * Best-effort fallback:
         *
         * Keep the resolved merchant but leave category
         * unset.
         *
         * A later categorization/backfill operation can
         * populate the category.
         */
        return {
            merchant:
            resolvedMerchant.merchant,

            merchantId:
            resolvedMerchant.merchant.id,

            merchantRaw: raw,

            merchantNormalized:
            resolvedMerchant.normalizedName,

            category: null,

            categoryId: null,

            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,

            confidence:
            resolvedMerchant.confidence,
        };
    }
};

/* -------------------------------------------------------------------------- */
/*                    Manual Transaction Merchant Resolution                  */
/* -------------------------------------------------------------------------- */

export const resolveManualTransactionMerchant =
    async ({
               merchantRaw,
           }: {
        merchantRaw?: string | null;
    }): Promise<ResolveTransactionMerchantResult> => {
        const raw =
            merchantRaw?.trim();

        /*
         * No merchant supplied.
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
         * Manual merchant input is authoritative.
         *
         * Do NOT call:
         *
         *   normalizeMerchantName()
         *   resolveMerchant()
         *   resolveMerchantWithAI()
         *
         * Example:
         *
         *   "Credit Card Transfer"
         *
         * must remain:
         *
         *   "Credit Card Transfer"
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

            category: null,

            categoryId: null,

            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,

            confidence: null,
        };
    };