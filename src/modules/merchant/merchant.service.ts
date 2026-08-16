import {
    Category,
    CategoryAssignmentSource,
    Merchant,
    MerchantMappingSource,
    Prisma,
    TransactionType,
} from "@prisma/client";

import {prisma} from "../../database/prisma";
import {
    CategorizeMerchantInput,
    MerchantCategorizationResult,
    MerchantCategoryOption,
    MerchantResolveResult,
    ResolveTransactionMerchantResult,
} from "./merchant.types";

import {categorizeMerchantWithAI, resolveMerchantWithAI} from "./merchant.ai";
import {normalizeMerchantName} from "./merchant.normalizer";

/* -------------------------------------------------------------------------- */
/*                              Category Helpers                              */
/* -------------------------------------------------------------------------- */
/**
 * Deduplicates concurrent merchant resolution requests within this Node process.
 * Prevents multiple AI calls when many emails for the same merchant arrive together.
 */
const resolvingMerchants = new Map<string, Promise<MerchantResolveResult>>();

/**
 * Deduplicates concurrent merchant categorization requests.
 */
const categorizingMerchants = new Map<string, Promise<MerchantCategorizationResult>>();

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

export const getOrCreateMerchant = async (
    name: string,
): Promise<Merchant> => {

    const existing = await prisma.merchant.findUnique({
        where: {name},
    });

    if (existing) {
        return existing;
    }

    try {
        return await prisma.merchant.create({
            data: {name},
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            return prisma.merchant.findUniqueOrThrow({
                where: {name},
            });
        }

        throw error;
    }
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

export const resolveMerchant = async (
    merchantName: string,
): Promise<MerchantResolveResult> => {

    const normalizedName =
        normalizeMerchantName(merchantName);

    if (!normalizedName) {
        throw new Error("Unable to normalize merchant name.");
    }

    const existing =
        resolvingMerchants.get(normalizedName);

    if (existing) {
        console.info("[Merchant] Waiting for in-flight resolution", {
            merchant: normalizedName,
        });

        return existing;
    }

    const promise = (async (): Promise<MerchantResolveResult> => {

        console.info("[Merchant] Resolving", {
            merchant: merchantName,
            normalizedMerchant: normalizedName,
        });

        /* -------------------------------------------------------------- */
        /* Alias lookup                                                   */
        /* -------------------------------------------------------------- */

        const alias =
            await findMerchantByAlias(normalizedName);

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

        /* -------------------------------------------------------------- */
        /* AI                                                             */
        /* -------------------------------------------------------------- */

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
            (await findMerchantByName(aiResult.merchant))
            ??
            (await getOrCreateMerchant(aiResult.merchant));

        await addAliasIfMissing(
            merchant.id,
            normalizedName,
        );

        console.info("[Merchant] Alias ready", {
            alias: normalizedName,
            merchant: merchant.name,
        });

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

export const categorizeMerchant = async ({
                                             userId,
                                             merchant,
                                             transactionType,
                                         }: CategorizeMerchantInput): Promise<MerchantCategorizationResult> => {

    const key =
        `${userId}:${merchant.id}:${transactionType}`;

    const existing = categorizingMerchants.get(key);

    if (existing) {
        console.info("[Merchant] Waiting for in-flight categorization", {
            merchant: merchant.name,
        });

        return existing;
    }

    const promise = (async (): Promise<MerchantCategorizationResult> => {

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

        if (latestMapping && latestMapping.category.type === transactionType) {
            return {
                merchant,
                category: latestMapping.category,
                confidence: latestMapping.confidence ?? 1,
                reasoning: "Previously categorized.",
                fromCache: true,
                categoryAssignmentSource: latestMapping.source === MerchantMappingSource.USER
                    ? CategoryAssignmentSource.USER
                    : CategoryAssignmentSource.AI_EXISTING,
            };
        }

        console.info("[Merchant] Categorizing", {
            merchant: merchant.name,
            transactionType,
        });

        const categoryOptions =
            await getMerchantCategoryOptions(userId, transactionType,);

        if (categoryOptions.length === 0) {
            throw new Error(
                `No ${transactionType} categories found.`,
            );
        }

        const aiResult =
            await categorizeMerchantWithAI(merchant.name, transactionType, categoryOptions,);

        const category =
            await getCategoryById(userId, aiResult.categoryId,);

        if (!category) {
            throw new Error("AI returned an invalid category.",);
        }

        console.info("[Merchant] AI categorized", {
            merchant: merchant.name,
            category: category.name,
            confidence: aiResult.confidence,
        });

        await learnMerchantCategory(userId, merchant.id, category.id, MerchantMappingSource.AI, aiResult.confidence,);

        return {
            merchant,
            category,
            confidence: aiResult.confidence,
            reasoning: aiResult.reasoning,
            fromCache: false,
            categoryAssignmentSource:
            CategoryAssignmentSource.AI_NEW,
        };

    })();

    categorizingMerchants.set(key, promise,);

    try {
        return await promise;
    } finally {
        categorizingMerchants.delete(
            key,
        );
    }
};

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

        if (existing && existing.source === MerchantMappingSource.USER) {
            console.info("[Merchant] Preserving USER mapping", {merchantId});
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
            category: null,
            categoryId: null,
            categoryAssignmentSource: CategoryAssignmentSource.USER,
            confidence: null,
        };
    }

    let resolvedMerchant: MerchantResolveResult | null = null;

    try {

        resolvedMerchant = await resolveMerchant(raw);

    } catch (error) {

        console.error("[Merchant] Failed to resolve merchant", {
            merchant: raw,
            error,
        });

        return {
            merchant: null,
            merchantId: null,
            merchantRaw: raw,
            category: null,
            categoryId: null,
            categoryAssignmentSource: CategoryAssignmentSource.USER,
            confidence: null,
        };

    }

    if (!shouldCategorize) {
        return {
            merchant: resolvedMerchant.merchant,
            merchantId: resolvedMerchant.merchant.id,
            merchantRaw: raw,
            category: null,
            categoryId: null,
            categoryAssignmentSource: CategoryAssignmentSource.USER,
            confidence: resolvedMerchant.confidence,
        };
    }

    try {

        const categorization = await categorizeMerchant({
            userId,
            merchant: resolvedMerchant.merchant,
            transactionType,
        });

        return {
            merchant: resolvedMerchant.merchant,
            merchantId: resolvedMerchant.merchant.id,
            merchantRaw: raw,
            category: categorization.category,
            categoryId: categorization.category.id,
            categoryAssignmentSource:
            categorization.categoryAssignmentSource,
            confidence: categorization.confidence,
        };

    } catch (error) {

        console.error("[Merchant] Failed to categorize merchant", {
            merchant: resolvedMerchant.merchant.name,
            error,
        });

        return {
            merchant: resolvedMerchant.merchant,
            merchantId: resolvedMerchant.merchant.id,
            merchantRaw: raw,
            category: null,
            categoryId: null,
            categoryAssignmentSource: CategoryAssignmentSource.USER,
            confidence: resolvedMerchant.confidence,
        };

    }

};