import {z} from "zod";
import {TransactionType} from "@prisma/client";

export const createTransactionSchema = z.object({
    type: z.enum([TransactionType.EXPENSE, TransactionType.INCOME, TransactionType.TRANSFER, TransactionType.INVESTMENT]),
    amount: z.coerce.number().positive(),
    date: z.string(),
    categoryId: z.string().optional(),
    sourceAccountId: z.string().optional(),
    destinationAccountId: z.string().optional(),
    note: z.string().optional(),
    idempotencyKey: z.string().optional()
});

export const updateTransactionSchema = createTransactionSchema;
export type UpdateTransactionDTO = z.infer<typeof updateTransactionSchema>;