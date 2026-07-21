import {MerchantMappingSource, Prisma, PrismaClient} from "@prisma/client";
import {normalizeMerchantName} from "./merchant.normalizer";
import {upsertMerchantMapping} from "./merchant.mapping.service";
import {DefaultArgs} from "@prisma/client/runtime/library";

export const learnMerchantCategory = async (tx: Omit<PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">, {
    userId, merchant, categoryId,
}: {
    userId: string;
    merchant: string;
    categoryId: string;
}) => {
    const trimmedMerchant = merchant.trim();

    if (!trimmedMerchant) {
        throw new Error("Merchant is required");
    }

    const normalizedName = normalizeMerchantName(trimmedMerchant);

    if (!normalizedName) {
        throw new Error("Unable to normalize merchant");
    }

    return upsertMerchantMapping({
        userId,
        merchant: trimmedMerchant,
        normalizedName,
        categoryId,
        source: MerchantMappingSource.USER,
        confidence: 1,
    });
};