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
import {normalizeMerchantName,} from "./merchant.normalizer";

/* -------------------------------------------------------------------------- */
/*                         In-flight request caches                            */
/* -------------------------------------------------------------------------- */

const resolvingMerchants = new Map<string, Promise<MerchantResolution>>();
const categorizingMerchants = new Map<string, Promise<MerchantCategorizationResult>>();

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

    const byId = new Map<string, Category>();

    for (const category of categories) {
        byId.set(
            category.id,
            category,
        );
    }

    const hasChildren = new Set<string>();
    for (const category of categories) {
        if (category.parentId) {
            hasChildren.add(
                category.parentId,
            );
        }
    }
    const buildPath = (category: Category,): string => {
        const path: string[] = [];
        let current: | Category | undefined = category;
        while (current) {
            path.unshift(current.name);
            current = current.parentId ? byId.get(current.parentId) : undefined
        }
        return path.join(" > ");
    };

    return categories
        .filter(category => !hasChildren.has(category.id))
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


const findCanonicalMerchant = async (
    name: string,
): Promise<Merchant | null> => {

    const merchant =
        await findMerchantByName(
            name,
        );


    if (merchant) {
        return merchant;
    }


    const alias =
        await findMerchantByAlias(
            name,
        );


    return alias?.merchant ?? null;
};


const addIncomingAlias = async (
    merchant: Merchant,
    normalizedName: string,
) => {

    if (
        merchant.name ===
        normalizedName
    ) {
        return;
    }


    await addAliasIfMissing(
        merchant.id,
        normalizedName,
    );
};


/* -------------------------------------------------------------------------- */
/*                           Merchant Resolution                              */
/* -------------------------------------------------------------------------- */

const resolveMerchantInternal = async (
    merchantName: string,
    normalizedName: string,
): Promise<MerchantResolution> => {

    /*
     * 1. Existing canonical merchant or alias.
     */

    const existingMerchant =
        await findCanonicalMerchant(
            normalizedName,
        );


    if (existingMerchant) {

        return {
            merchant:
            existingMerchant,

            normalizedName:
            existingMerchant.name,

            confidence: 1,

            fromCache: true,
        };
    }


    /*
     * 2. AI resolution.
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


        /*
         * Resolve the AI result against the
         * existing merchant registry.
         */

        let merchant =
            await findCanonicalMerchant(
                canonicalName,
            );


        /*
         * Only create a merchant when AI actually
         * produced a valid canonical identity.
         */

        if (!merchant) {

            merchant =
                await getOrCreateMerchant(
                    canonicalName,
                );
        }


        await addIncomingAlias(
            merchant,
            normalizedName,
        );


        console.info(
            "[Merchant] AI resolved",
            {
                original:
                merchantName,

                aiMerchant:
                canonicalName,

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
         * IMPORTANT:
         *
         * AI failure does NOT mean that the normalized
         * input is a canonical merchant.
         *
         * Do NOT create:
         *
         *     Merchant("Unknown")
         *     Merchant("Qr722hgc")
         *     Merchant("P2m 660615862577")
         *
         * The transaction layer will preserve the raw
         * value without creating a fake Merchant.
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


        throw error;
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


    const existing =
        resolvingMerchants.get(
            normalizedName,
        );


    if (existing) {

        return existing;
    }


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

    shouldCategorize?: boolean;

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
                merchant:
                raw,

                error,
            },
        );


        if (requireCategory) {
            throw error;
        }


        /*
         * Preserve the parser's raw merchant.
         *
         * No Merchant row is created.
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

            merchantRaw:
            raw,

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

            merchantRaw:
            raw,

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


        if (requireCategory) {
            throw error;
        }


        /*
         * Merchant resolution succeeded.
         * Categorization is only enrichment.
         */

        return {

            merchant:
            resolvedMerchant.merchant,

            merchantId:
            resolvedMerchant.merchant.id,

            merchantRaw:
            raw,

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
         * No normalization.
         * No AI.
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