import {z} from "zod";
import {TransactionType} from "@prisma/client";

export const createCategoryGroupSchema = z.object({
    name: z.string().trim().min(1, "Category name is required"),
    type: z.enum([
        TransactionType.EXPENSE,
        TransactionType.INCOME,
        TransactionType.TRANSFER,
        TransactionType.INVESTMENT
    ]),
    children: z
        .array(z.string().trim().min(1))
        .min(1, "At least one subcategory is required"),
});

export type CreateCategoryGroupDTO =
    z.infer<typeof createCategoryGroupSchema>;