import {MerchantMappingSource} from "@prisma/client";

import {prisma} from "../../database/prisma";

export interface UpsertMerchantMappingInput {
    userId: string;
    merchant: string;
    normalizedName: string;
    categoryId: string;
    source: MerchantMappingSource;
    confidence?: number;
}

export const upsertMerchantMapping = async ({
                                                userId,
                                                merchant,
                                                normalizedName,
                                                categoryId,
                                                source,
                                                confidence = 1,
                                            }: UpsertMerchantMappingInput) => {
    const displayName = merchant.trim();

    if (!normalizedName.trim()) {
        throw new Error("normalizedName is required.");
    }

    const normalizedConfidence = Math.max(
        0,
        Math.min(1, confidence),
    );

    return prisma.merchantMapping.upsert({
        where: {
            userId_normalizedName: {
                userId,
                normalizedName,
            },
        },
        update: {
            displayName,
            categoryId,
            source,
            confidence: normalizedConfidence,
        },
        create: {
            userId,
            normalizedName,
            displayName,
            categoryId,
            source,
            confidence: normalizedConfidence,
        },
        include: {
            category: true,
        },
    });
};