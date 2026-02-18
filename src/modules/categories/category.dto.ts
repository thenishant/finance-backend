import {z} from "zod";

export const createCategorySchema = z.object({
    name: z.string().min(1),
    type: z.enum(["INCOME", "EXPENSE"]),
    parentId: z.string().optional()
});

export const createCategoryWithChildrenSchema = z.object({
    name: z.string().min(1),
    type: z.enum(["INCOME", "EXPENSE"]),
    children: z.array(z.string()).optional()
});

export type CreateCategoryDTO = z.infer<typeof createCategorySchema>;
export type CreateCategoryWithChildrenDTO =
    z.infer<typeof createCategoryWithChildrenSchema>;