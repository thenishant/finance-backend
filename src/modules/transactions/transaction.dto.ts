import {z} from "zod";

export const createTransactionSchema = z.object({
    type: z.enum(["EXPENSE", "INCOME", "TRANSFER", "INVESTMENT"]),
    amount: z.coerce.number().positive(),
    date: z.string(),
    categoryId: z.string().optional(),
    fromAccountId: z.string().optional(),
    toAccountId: z.string().optional(),
    paymentMethod: z.enum(["CASH", "BANK", "CREDIT_CARD", "UPI"]),
    note: z.string().optional(),
    idempotencyKey: z.string().optional()
});