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
/*                              Configuration                                 */
/* -------------------------------------------------------------------------- */

const AI_ENABLED = process.env.APP_ENV !== "test";

/* -------------------------------------------------------------------------- */
/*                         In-flight request caches                            */
/* -------------------------------------------------------------------------- */

const resolvingMerchants =
    new Map<string, Promise<MerchantResolution>>();

const categorizingMerchants =
    new Map<string, Promise<MerchantCategorizationResult>>();

/* -------------------------------------------------------------------------- */
/*                              Category Helpers                              */
/* -------------------------------------------------------------------------- */

export const getMerchantCategoryOptions = async (
    userId: string,
    transactionType: TransactionType,
): Promise<MerchantCategoryOption[]> => {
    const categories = await prisma.category.findMany({
        where: {
            userId,
            type: transactionType,
        },
        orderBy: {
            name: "asc",
        },
    });

    const byId = new Map<string, Category>();

    for (const category of categories) {
        byId.set(category.id, category);
    }

    const hasChildren = new Set<string>();

    for (const category of categories) {
        if (category.parentId) {
            hasChildren.add(category.parentId);
        }
    }

    const buildPath = (category: Category): string => {
        const path: string[] = [];

        let current: Category | undefined = category;

        while (current) {
            path.unshift(current.name);

            current = current.parentId
                ? byId.get(current.parentId)
                : undefined;
        }

        return path.join(" > ");
    };

    return categories
        .filter(category => !hasChildren.has(category.id))
        .sort((a, b) =>
            buildPath(a).localeCompare(buildPath(b)),
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
    /*
     * Upsert avoids the find-then-create race:
     *
     * Request A -> find -> nothing
     * Request B -> find -> nothing
     * Request A -> create
     * Request B -> create -> P2002
     *
     * Since merchant.name is unique, upsert is the cleanest solution.
     */
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

export const resolveMerchant = async (
    merchantName: string,
): Promise<MerchantResolution> => {
    const normalizedName =
        normalizeMerchantName(merchantName);

    if (!normalizedName) {
        throw new Error(
            "Unable to normalize merchant name.",
        );
    }

    const existing =
        resolvingMerchants.get(normalizedName);

    if (existing) {
        console.info(
            "[Merchant] Waiting for in-flight resolution",
            {
                merchant: normalizedName,
            },
        );

        return existing;
    }

    const promise =
        (async (): Promise<MerchantResolution> => {
            console.info("[Merchant] Resolving", {
                merchant: merchantName,
                normalizedMerchant: normalizedName,
            });

            const exactMerchant =
                await findMerchantByName(merchantName);

            if (exactMerchant) {
                return {
                    merchant: exactMerchant,
                    normalizedName,
                    confidence: 1,
                    fromCache: true,
                };
            }

            /*
             * First check aliases.
             */
            const alias =
                await findMerchantByAlias(
                    normalizedName,
                );

            if (alias) {
                console.info("[Merchant] Alias hit", {
                    alias: normalizedName,
                    merchant: alias.merchant.name,
                });

                return {
                    merchant: alias.merchant,
                    normalizedName,
                    confidence: 1,
                    fromCache: true,
                };
            }

            /*
             * Tests must never invoke OpenAI.
             */
            if (!AI_ENABLED) {
                const merchant =
                    await getOrCreateMerchant(
                        merchantName,
                    );

                return {
                    merchant,
                    normalizedName,
                    confidence: 1,
                    fromCache: false,
                };
            }

            /*
             * Production AI resolution.
             */
            console.info("[Merchant] Calling AI", {
                merchant: merchantName,
            });

            const aiResult =
                await resolveMerchantWithAI(
                    merchantName,
                );

            console.info(
                "[Merchant] AI resolved",
                {
                    merchant: aiResult.merchant,
                    confidence:
                    aiResult.confidence,
                },
            );

            const merchant =
                await getOrCreateMerchant(
                    aiResult.merchant,
                );

            await addAliasIfMissing(
                merchant.id,
                normalizedName,
            );

            console.info(
                "[Merchant] Alias ready",
                {
                    alias: normalizedName,
                    merchant: merchant.name,
                },
            );

            return {
                merchant,
                normalizedName,
                confidence: aiResult.confidence,
                fromCache: false,
            };
        })();

    resolvingMerchants.set(
        normalizedName,
        promise,
    );

    try {
        return await promise;
    } finally {
        resolvingMerchants.delete(
            normalizedName,
        );
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

    const existing =
        categorizingMerchants.get(key);

    if (existing) {
        console.info(
            "[Merchant] Waiting for in-flight categorization",
            {
                merchant: merchant.name,
            },
        );

        return existing;
    }

    const promise =
        (async (): Promise<MerchantCategorizationResult> => {
            /*
             * --------------------------------------------------------------
             * Existing mapping
             * --------------------------------------------------------------
             */

            const latestMapping =
                await prisma.merchantMapping.findUnique({
                    where: {
                        userId_merchantId: {
                            userId,
                            merchantId: merchant.id,
                        },
                    },
                    include: {
                        category: true,
                    },
                });

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
                        latestMapping.confidence ?? 1,
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
             * --------------------------------------------------------------
             * Available categories
             * --------------------------------------------------------------
             */

            const categoryOptions =
                await getMerchantCategoryOptions(
                    userId,
                    transactionType,
                );

            if (categoryOptions.length === 0) {
                throw new Error(
                    `No ${transactionType} categories found.`,
                );
            }

            /*
             * --------------------------------------------------------------
             * Test environment
             * --------------------------------------------------------------
             *
             * Select a real category.
             * Never return category: null because the result contract
             * requires Category.
             */

            if (!AI_ENABLED) {
                const categoryOption =
                    categoryOptions[0];

                if (!categoryOption) {
                    throw new Error(
                        `No ${transactionType} categories found.`,
                    );
                }

                const category =
                    await getCategoryById(
                        userId,
                        categoryOption.id,
                    );

                if (!category) {
                    throw new Error(
                        "Test category not found.",
                    );
                }

                return {
                    merchant,
                    category,
                    confidence: 1,
                    reasoning:
                        "Test categorization.",
                    fromCache: false,
                    categoryAssignmentSource:
                    CategoryAssignmentSource.AI,
                };
            }

            /*
             * --------------------------------------------------------------
             * AI categorization
             * --------------------------------------------------------------
             */

            console.info(
                "[Merchant] Categorizing",
                {
                    merchant: merchant.name,
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
             * --------------------------------------------------------------
             * Validate AI category
             * --------------------------------------------------------------
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

            console.info(
                "[Merchant] AI categorized",
                {
                    merchant: merchant.name,
                    category: category.name,
                    confidence:
                    aiResult.confidence,
                },
            );

            /*
             * --------------------------------------------------------------
             * Learn mapping
             * --------------------------------------------------------------
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
        categorizingMerchants.delete(
            key,
        );
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
     * Never overwrite a user's explicit mapping with AI.
     */
    if (source === MerchantMappingSource.AI) {
        const existing =
            await prisma.merchantMapping.findUnique({
                where: {
                    userId_merchantId: {
                        userId,
                        merchantId,
                    },
                },
            });

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
                                                 }: {
    userId: string;
    merchantRaw?: string | null;
    transactionType: TransactionType;
    shouldCategorize?: boolean;
}): Promise<ResolveTransactionMerchantResult> => {
    const raw = merchantRaw?.trim();

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

    let resolvedMerchant: MerchantResolution;

    try {
        resolvedMerchant =
            await resolveMerchant(raw);
    } catch (error) {
        console.error(
            "[Merchant] Failed to resolve merchant",
            {
                merchant: raw,
                error,
            },
        );

        return {
            merchant: null,
            merchantId: null,
            merchantRaw: raw,
            category: null,
            categoryId: null,
            merchantNormalized:
                normalizeMerchantName(raw),
            categoryAssignmentSource:
            CategoryAssignmentSource.NONE,
            confidence: null,
        };
    }

    /*
     * Merchant resolution succeeded but categorization was not requested.
     */
    if (!shouldCategorize) {
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

        return {
            merchant:
            resolvedMerchant.merchant,

            merchantId:
            resolvedMerchant.merchant.id,

            merchantRaw: raw,

            category:
            categorization.category,

            categoryId:
            categorization.category.id,

            categoryAssignmentSource:
            categorization.categoryAssignmentSource,

            confidence:
            categorization.confidence,

            merchantNormalized:
            resolvedMerchant.normalizedName,
        };
    } catch (error) {
        console.error(
            "[Merchant] Failed to categorize merchant",
            {
                merchant:
                resolvedMerchant.merchant.name,
                error,
            },
        );

        /*
         * Categorization failure should not destroy the merchant
         * resolution. The transaction layer can decide whether a
         * category is required.
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
