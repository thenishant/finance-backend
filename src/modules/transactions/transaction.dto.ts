import {z} from "zod";

export const createTransactionSchema = z.object({
    type: z.enum(["INCOME", "EXPENSE", "TRANSFER", "INVESTMENT"]),
    amount: z.number().positive(),
    date: z.string(),
    categoryId: z.string(),
    fromAccountId: z.string().optional(),
    toAccountId: z.string().optional(),
    note: z.string().optional()
});

export type CreateTransactionDTO = z.infer<typeof createTransactionSchema>;