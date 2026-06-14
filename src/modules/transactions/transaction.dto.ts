import {z} from "zod";

export const createTransactionSchema = z.object({
    type: z.enum([
        "EXPENSE",
        "INCOME",
        "TRANSFER",
        "INVESTMENT"
    ]),
    amount: z.coerce.number().positive(),
    date: z.string(),
    categoryId: z.string().optional(),
    sourceAccountId: z.string().optional(),
    destinationAccountId: z.string().optional(),
    note: z.string().optional(),
    idempotencyKey: z.string().optional()
});