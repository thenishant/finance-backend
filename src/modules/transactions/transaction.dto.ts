import {z} from "zod";

export const createTransactionSchema = z.object({
    transactionType: z
        .string()
        .transform(val => val.toUpperCase())
        .pipe(
            z.enum([
                "INCOME",
                "EXPENSE",
                "INVESTMENT",
                "TRANSFER"
            ])
        ),

    paymentMethod: z
        .string()
        .transform(val => val.toUpperCase())
        .pipe(
            z.enum([
                "CASH",
                "BANK",
                "CREDIT_CARD"
            ])
        ),

    amount: z.number().positive(),
    date: z.string(),
    categoryId: z.string().optional(),
    fromAccountId: z.string().optional(),
    toAccountId: z.string().optional(),
    note: z.string().optional()
});

export type CreateTransactionDTO =
    z.infer<typeof createTransactionSchema>;