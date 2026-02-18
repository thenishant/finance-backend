import {prisma} from "../../database/prisma";
import {CreateCategoryDTO, CreateCategoryWithChildrenDTO} from "./category.dto";


// ==========================
// GET TREE
// ==========================
export const getCategoryTree = async (userId: string) => {
    const categories = await prisma.category.findMany({
        where: {userId},
        orderBy: {createdAt: "asc"}
    });

    const parents = categories.filter(c => !c.parentId);

    return parents.map(parent => ({
        id: parent.id,
        name: parent.name,
        type: parent.type,
        createdAt: parent.createdAt,
        updatedAt: parent.updatedAt,
        children: categories
            .filter(c => c.parentId === parent.id)
            .map(child => ({
                id: child.id,
                name: child.name,
                type: child.type,
                createdAt: child.createdAt,
                updatedAt: child.updatedAt
            }))
    }));
};


// ==========================
// CREATE SINGLE CATEGORY
// ==========================
export const createCategory = async (
    userId: string,
    data: CreateCategoryDTO
) => {

    if (data.parentId) {
        const parent = await prisma.category.findFirst({
            where: {
                id: data.parentId,
                userId
            }
        });

        if (!parent) {
            throw new Error("Invalid parent category");
        }

        // Enforce 2-level limit
        if (parent.parentId !== null) {
            throw new Error("Only two category levels allowed");
        }

        // Type must match parent
        if (parent.type !== data.type) {
            throw new Error("Subcategory type must match parent type");
        }
    }

    return prisma.category.create({
        data: {
            userId,
            name: data.name,
            type: data.type,
            parentId: data.parentId ?? null
        }
    });
};


// ==========================
// BULK CREATE (Parent + Children)
// ==========================
export const createCategoryWithChildren = async (
    userId: string,
    data: CreateCategoryWithChildrenDTO
) => {
    return prisma.$transaction(async (tx) => {

        const parent = await tx.category.create({
            data: {
                userId,
                name: data.name,
                type: data.type
            }
        });

        if (data.children?.length) {
            for (const childName of data.children) {
                await tx.category.create({
                    data: {
                        userId,
                        name: childName,
                        type: data.type,
                        parentId: parent.id
                    }
                });
            }
        }

        return parent;
    });
};