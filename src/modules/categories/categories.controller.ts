import {NextFunction, Response} from "express";
import {AuthRequest} from "../../shared/middleware/auth.middleware";
import {createCategorySchema, createCategoryWithChildrenSchema} from "./category.dto";
import {createCategory, createCategoryWithChildren, getCategoryTree} from "./categories.service";


// ==========================
// LIST TREE
// ==========================
export const list = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const categories = await getCategoryTree(req.user!.userId);

        return res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        next(error);
    }
};


// ==========================
// CREATE SINGLE
// ==========================
export const create = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const validated = createCategorySchema.parse(req.body);

        const category = await createCategory(
            req.user!.userId,
            validated
        );

        return res.status(201).json({
            success: true,
            data: category
        });
    } catch (error) {
        next(error);
    }
};


// ==========================
// BULK CREATE
// ==========================
export const createBulk = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const validated = createCategoryWithChildrenSchema.parse(req.body);

        const parent = await createCategoryWithChildren(
            req.user!.userId,
            validated
        );

        return res.status(201).json({
            success: true,
            data: parent
        });
    } catch (error) {
        next(error);
    }
};