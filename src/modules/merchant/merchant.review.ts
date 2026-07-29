import {CategoryAssignmentSource} from "@prisma/client";

export const REVIEW_CONFIDENCE_THRESHOLD = 0.75;

export const needsCategoryReview = ({
                                        assignmentSource,
                                        confidence,
                                        categoryName,
                                    }: {
    assignmentSource: CategoryAssignmentSource;
    confidence: number | null;
    categoryName?: string | null;
}) => {

    if (assignmentSource === CategoryAssignmentSource.USER) {
        return false;
    }

    if (confidence == null) {
        return false;
    }

    if (confidence < REVIEW_CONFIDENCE_THRESHOLD) {
        return true;
    }

    return categoryName?.toLowerCase() === "misc";
};