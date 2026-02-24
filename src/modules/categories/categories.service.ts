import {prisma} from "../../database/prisma";
import {TransactionType} from "@prisma/client";

export const getCategoryTree = async (userId: string) => {

    const categories = await prisma.category.findMany({
        where: {userId},
        orderBy: {name: "asc"}
    });

    const parents = categories
        .filter(c => !c.parentId)
        .sort((a, b) =>
            a.name.localeCompare(b.name)
        );

    return parents.map(parent => ({
        id: parent.id,
        name: parent.name,
        type: parent.type,
        children: categories
            .filter(c => c.parentId === parent.id)
            .sort((a, b) =>
                a.name.localeCompare(b.name)
            )
            .map(child => ({
                id: child.id,
                name: child.name,
                type: child.type,
                parentId: child.parentId
            }))
    }));
};

export const createCategoryGroup = async (
    userId: string,
    data: {
        name: string;
        type: TransactionType;
        children: string[];
    }
) => {
    const parentName = data.name.trim();

    if (!parentName)
        throw new Error("Category name required");

    const normalizedParent = parentName.toLowerCase();

    const children = data.children
        .map(c => c.trim())
        .filter(Boolean);

    if (children.length === 0)
        throw new Error("At least one subcategory required");

    // Remove duplicate children ignoring case
    const uniqueChildren = [
        ...new Map(
            children.map(c => [c.toLowerCase(), c])
        ).values()
    ];

    return prisma.$transaction(async (tx) => {

        /* =========================
           1️⃣ Find parent ignoring case
        ========================== */

        let parent = await tx.category.findFirst({
            where: {
                userId,
                parentId: null,
                type: data.type,
                name: {
                    equals: parentName,
                    mode: "insensitive"
                }
            }
        });

        /* =========================
           2️⃣ Create parent if missing
        ========================== */

        if (!parent) {
            parent = await tx.category.create({
                data: {
                    userId,
                    name: parentName,
                    type: data.type
                }
            });
        }

        /* =========================
           3️⃣ Fetch existing children
        ========================== */

        const existingChildren = await tx.category.findMany({
            where: {
                userId,
                parentId: parent.id
            }
        });

        const existingLower = new Set(
            existingChildren.map(c => c.name.toLowerCase())
        );

        /* =========================
           4️⃣ Filter only new children
        ========================== */

        const newChildren = uniqueChildren.filter(
            name => !existingLower.has(name.toLowerCase())
        );

        /* =========================
           5️⃣ Insert new children
        ========================== */

        if (newChildren.length > 0) {
            await tx.category.createMany({
                data: newChildren.map(child => ({
                    userId,
                    name: child,
                    type: data.type,
                    parentId: parent!.id
                }))
            });
        }

        return parent;
    });
};