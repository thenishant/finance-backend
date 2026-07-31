import {Category, CategoryAssignmentSource, Merchant, MerchantMappingSource, TransactionType,} from "@prisma/client";

import {prisma} from "../../database/prisma";
import {
    CategorizeMerchantInput,
    MerchantCategorizationResult,
    MerchantCategoryOption,
    MerchantResolveResult,
} from "./merchant.types";
import {categorizeMerchantWithAI, resolveMerchantWithAI} from "./merchant.ai";
import {normalizeMerchantName} from "./merchant.normalizer";

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
        .sort((a, b) => buildPath(a).localeCompare(buildPath(b)))
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

export const createMerchant = (
    name: string,
) => {
    return prisma.merchant.create({
        data: {
            name,
        },
    });
};

export const getOrCreateMerchant = async (
    name: string,
): Promise<Merchant> => {

    const existing = await prisma.merchant.findUnique({
        where: {
            name,
        },
    });

    if (existing) {
        return existing;
    }

    return prisma.merchant.create({
        data: {
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
): Promise<MerchantResolveResult> => {

    const normalizedName = normalizeMerchantName(
        merchantName,
    );

    if (!normalizedName) {
        throw new Error(
            "Unable to normalize merchant name.",
        );
    }

    console.info("[Merchant] Resolving", {
        merchant: merchantName,
        normalizedMerchant: normalizedName,
    });

    /* ---------------------------------------------------------------------- */
    /* Alias Lookup                                                            */
    /* ---------------------------------------------------------------------- */

    const alias = await findMerchantByAlias(
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

    /* ---------------------------------------------------------------------- */
    /* Exact Merchant Lookup                                                   */
    /* ---------------------------------------------------------------------- */

    const existingMerchant =
        await findMerchantByName(
            normalizedName,
        );

    if (existingMerchant) {

        await addAliasIfMissing(
            existingMerchant.id,
            normalizedName,
        );

        console.info("[Merchant] Merchant hit", {
            merchant: existingMerchant.name,
        });

        return {
            merchant: existingMerchant,
            normalizedName,
            confidence: 1,
            fromCache: true,
        };
    }

    /* ---------------------------------------------------------------------- */
    /* AI Resolution                                                           */
    /* ---------------------------------------------------------------------- */

    console.info("[Merchant] Calling AI", {
        merchant: merchantName,
    });

    const aiResult =
        await resolveMerchantWithAI(
            merchantName,
        );

    console.info("[Merchant] AI resolved", {
        merchant: aiResult.merchant,
        confidence: aiResult.confidence,
    });

    const merchant =
        await getOrCreateMerchant(
            aiResult.merchant,
        );

    await addAliasIfMissing(
        merchant.id,
        normalizedName,
    );

    console.info("[Merchant] Alias learned", {
        alias: normalizedName,
        merchant: merchant.name,
    });

    return {
        merchant,
        normalizedName,
        confidence: aiResult.confidence,
        fromCache: false,
    };
};

/* -------------------------------------------------------------------------- */
/*                         Merchant Categorization                            */
/* -------------------------------------------------------------------------- */

export const categorizeMerchant = async ({
                                             userId,
                                             merchant,
                                             transactionType,
                                         }: CategorizeMerchantInput): Promise<MerchantCategorizationResult> => {

    console.info("[Merchant] Categorizing", {
        merchant: merchant.name,
        transactionType,
    });

    /* ---------------------------------------------------------------------- */
    /* Merchant Mapping Lookup                                                 */
    /* ---------------------------------------------------------------------- */

    const existingMapping =
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
        existingMapping &&
        existingMapping.category.type === transactionType
    ) {
        console.info("[Merchant] Mapping hit", {
            merchant: merchant.name,
            category: existingMapping.category.name,
        });

        return {
            merchant,
            category: existingMapping.category,
            confidence: existingMapping.confidence ?? 1,
            reasoning: "Previously categorized.",
            fromCache: true,
            categoryAssignmentSource:
                existingMapping.source === MerchantMappingSource.USER
                    ? CategoryAssignmentSource.USER
                    : CategoryAssignmentSource.AI_EXISTING,
        };
    }

    /* ---------------------------------------------------------------------- */
    /* Load Categories                                                        */
    /* ---------------------------------------------------------------------- */

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

    /* ---------------------------------------------------------------------- */
    /* Ask AI                                                                 */
    /* ---------------------------------------------------------------------- */

    const aiResult =
        await categorizeMerchantWithAI(
            merchant.name,
            transactionType,
            categoryOptions,
        );

    /* ---------------------------------------------------------------------- */
    /* Validate Category                                                      */
    /* ---------------------------------------------------------------------- */

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

    /* ---------------------------------------------------------------------- */
    /* Save Mapping                                                           */
    /* ---------------------------------------------------------------------- */
    console.info("[Merchant] AI categorized", {
        merchant: merchant.name,
        category: category.name,
        confidence: aiResult.confidence,
    });

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
        confidence: aiResult.confidence,
        reasoning: aiResult.reasoning,
        fromCache: false,
        categoryAssignmentSource: CategoryAssignmentSource.AI_NEW,
    };
};
/* -------------------------------------------------------------------------- */
/*                            Merchant Learning                               */
/* -------------------------------------------------------------------------- */

export const learnMerchantCategory = async (
    userId: string,
    merchantId: string,
    categoryId: string,
    source: MerchantMappingSource,
    confidence = 1,
) => {

    // Never overwrite USER mappings with AI
    if (source === MerchantMappingSource.AI) {
        const existing = await prisma.merchantMapping.findUnique({
            where: {
                userId_merchantId: {
                    userId,
                    merchantId,
                },
            },
        });

        if (
            existing &&
            existing.source === MerchantMappingSource.USER
        ) {
            console.info("[Merchant] Preserving USER mapping", {
                merchantId,
            });

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

    console.info("[Merchant] Mapping learned", {
        merchantId,
        categoryId,
        source,
        confidence,
    });
};