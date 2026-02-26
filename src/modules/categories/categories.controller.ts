import {NextFunction, Response} from "express";
import {AuthRequest} from "../../shared/middleware/auth.middleware";
import {createCategoryGroup, getCategoryTree, getLeafCategories} from "./categories.service";
import {createCategoryGroupSchema} from "./category.dto";

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

export const listLeaf = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const categories = await getLeafCategories(req.user!.userId);

        return res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        next(error);
    }
};

export const createBulk = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const validated =
            createCategoryGroupSchema.parse(req.body);

        const parent = await createCategoryGroup(
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