import {needsCategoryReview} from "../merchant/merchant.review";
import {CategoryAssignmentSource} from "@prisma/client";

export const mapTransaction = <
    T extends {
        categoryAssignmentSource: CategoryAssignmentSource;
        aiCategoryConfidence: number | null;
        merchant?: {
            id: string;
            name: string;
        } | null;
        category?: {
            name: string;
        } | null;
    }
>(
    trx: T,
) => ({
    ...trx,
    needsCategoryReview: needsCategoryReview({
        assignmentSource: trx.categoryAssignmentSource,
        confidence: trx.aiCategoryConfidence,
        categoryName: trx.category?.name,
    }),
});
