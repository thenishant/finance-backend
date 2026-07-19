import {Category, TransactionType} from "@prisma/client";

import {prisma} from "../../database/prisma";
import {MerchantCategoryTreeNode} from "./merchant.types";

/**
 * Returns all categories for the given transaction type as a parent → child tree.
 */
export const getMerchantCategoryTree = async (
    userId: string,
    transactionType: TransactionType,
): Promise<MerchantCategoryTreeNode[]> => {

    const categories = await prisma.category.findMany({
        where: {
            userId,
            type: transactionType,
        },
        orderBy: {
            name: "asc",
        },
    });

    const childrenByParent = new Map<string, Category[]>();

    for (const category of categories) {
        if (!category.parentId) {
            continue;
        }

        const children = childrenByParent.get(category.parentId) ?? [];
        children.push(category);
        childrenByParent.set(category.parentId, children);
    }

    const buildTree = (parent: Category): MerchantCategoryTreeNode => ({
        id: parent.id,
        name: parent.name,
        type: parent.type,
        children: (childrenByParent.get(parent.id) ?? [])
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(buildTree),
    });

    return categories
        .filter(category => !category.parentId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(buildTree);
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