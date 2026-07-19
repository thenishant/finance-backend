import {MerchantMappingSource} from "@prisma/client";

import {prisma} from "../../database/prisma";
import {categorizeMerchantWithAI} from "./merchant.ai";
import {getCategoryById, getMerchantCategoryTree,} from "./merchant.category";
import {upsertMerchantMapping} from "./merchant.mapping.service";
import {normalizeMerchantName} from "./merchant.normalizer";
import {CategorizeMerchantInput, MerchantCategorizationResult,} from "./merchant.types";

export const categorizeMerchant = async ({
                                             userId,
                                             merchantName,
                                             transactionType,
                                         }: CategorizeMerchantInput): Promise<MerchantCategorizationResult> => {
    const normalizedName = normalizeMerchantName(merchantName);

    if (!normalizedName) {
        throw new Error("Unable to normalize merchant name.");
    }

    console.info("[Merchant] Categorizing", {
        merchant: merchantName,
        normalizedMerchant: normalizedName,
        transactionType,
    });

    /**
     * 1. Check cache
     */
    const existing = await prisma.merchantMapping.findUnique({
        where: {
            userId_normalizedName: {
                userId,
                normalizedName,
            },
        },
        include: {
            category: true,
        },
    });

    if (
        existing &&
        existing.category.type === transactionType
    ) {
        console.info("[Merchant] Cache hit", {
            merchant: merchantName,
            normalizedMerchant: normalizedName,
            category: existing.category.name,
            confidence: existing.confidence ?? 1,
        });

        return {
            category: existing.category,
            confidence: existing.confidence ?? 1,
            reasoning: "Merchant previously categorized.",
            fromCache: true,
        };
    }

    console.info("[Merchant] Cache miss", {
        merchant: merchantName,
        normalizedMerchant: normalizedName,
    });

    /**
     * 2. Load category tree
     */
    const categoryTree = await getMerchantCategoryTree(
        userId,
        transactionType,
    );

    if (categoryTree.length === 0) {
        throw new Error(
            `No ${transactionType} categories found.`,
        );
    }

    console.info("[Merchant] Calling AI", {
        merchant: merchantName,
        categoryCount: categoryTree.length,
    });

    /**
     * 3. Ask AI
     */
    const aiResult = await categorizeMerchantWithAI(
        merchantName,
        transactionType,
        categoryTree,
    );

    console.info("[Merchant] AI response", {
        merchant: merchantName,
        categoryId: aiResult.categoryId,
        confidence: aiResult.confidence,
        reasoning: aiResult.reasoning,
    });

    /**
     * 4. Validate category
     */
    const category = await getCategoryById(
        userId,
        aiResult.categoryId,
    );

    if (!category) {
        throw new Error("AI returned an invalid category.");
    }

    /**
     * 5. Save merchant mapping
     */
    await upsertMerchantMapping({
        userId,
        merchant: merchantName,
        normalizedName,
        categoryId: category.id,
        source: MerchantMappingSource.AI,
        confidence: aiResult.confidence,
    });

    console.info("[Merchant] Mapping saved", {
        merchant: merchantName,
        normalizedMerchant: normalizedName,
        category: category.name,
        confidence: aiResult.confidence,
    });

    /**
     * 6. Return result
     */
    return {
        category,
        confidence: aiResult.confidence,
        reasoning: aiResult.reasoning,
        fromCache: false,
    };
};