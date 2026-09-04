import {FinancialAccountType, TransactionType,} from "@prisma/client";
import {z} from "zod";

export const createTransactionSchema = z.object({
    type: z.enum([
        TransactionType.EXPENSE,
        TransactionType.INCOME,
        TransactionType.TRANSFER,
        TransactionType.INVESTMENT,
    ]),

    amount: z.coerce.number().positive(),

    date: z.string(),

    categoryId: z.string().optional(),

    sourceAccountId: z.string().optional(),

    destinationAccountId: z.string().optional(),

    note: z.string().optional(),

    idempotencyKey: z.string().optional(),
});

export const updateTransactionSchema =
    createTransactionSchema;

export type UpdateTransactionDTO =
    z.infer<typeof updateTransactionSchema>;

/*
 * --------------------------------------------------------------------------
 * Transaction query
 * --------------------------------------------------------------------------
 */

export const transactionSortBySchema = z.enum([
    "date",
    "createdAt",
    "amount",
    "merchant",
    "category",
]);

export const transactionOrderSchema = z.enum([
    "asc",
    "desc",
]);

export const getTransactionsQuerySchema = z.object({
    sortBy: transactionSortBySchema
        .optional()
        .default("date"),

    order: transactionOrderSchema
        .optional()
        .default("desc"),

    type: z
        .nativeEnum(TransactionType)
        .optional(),

    categoryId: z
        .string()
        .optional(),

    accountId: z
        .string()
        .optional(),

    accountType: z
        .nativeEnum(FinancialAccountType)
        .optional(),

    from: z
        .string()
        .optional(),

    to: z
        .string()
        .optional(),
});

export type GetTransactionsQuery =
    z.infer<typeof getTransactionsQuerySchema>;