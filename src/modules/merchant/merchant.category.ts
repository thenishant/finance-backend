import {Category, TransactionType} from "@prisma/client";

import {prisma} from "../../database/prisma";
import {MerchantCategoryOption} from "./merchant.types";

/**
 * Returns every leaf category together with its full hierarchy.
 *
 * Example:
 *
 * Transport > Fuel
 * Transport > Fastag
 * Food > Restaurants
 */
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
        const parts: string[] = [];

        let current: Category | undefined = category;

        while (current) {
            parts.unshift(current.name);

            current = current.parentId
                ? byId.get(current.parentId)
                : undefined;
        }

        return parts.join(" > ");
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

/**
 * Returns a category if it belongs to the user.
 */
export const getCategoryById = async (
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