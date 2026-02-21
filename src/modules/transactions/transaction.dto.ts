import {z} from "zod";
import {PaymentMethod} from "@prisma/client";

export const createTransactionSchema = z.object({
    amount: z.number(),
    type: z.enum(["INCOME", "EXPENSE", "INVESTMENT", "TRANSFER"]),
    paymentMethod: z.enum(PaymentMethod),
    date: z.string(),
    categoryId: z.string().optional(),
    fromAccountId: z.string().optional(),
    toAccountId: z.string().optional(),
    note: z.string().optional(),
});

export type CreateTransactionDTO = z.infer<typeof createTransactionSchema>;