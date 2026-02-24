import {z} from "zod";

export const createCategoryGroupSchema = z.object({
    name: z.string().trim().min(1, "Category name is required"),
    type: z.enum([
        "EXPENSE",
        "INCOME",
        "TRANSFER",
        "INVESTMENT"
    ]),
    children: z
        .array(z.string().trim().min(1))
        .min(1, "At least one subcategory is required"),
});

export type CreateCategoryGroupDTO =
    z.infer<typeof createCategoryGroupSchema>;