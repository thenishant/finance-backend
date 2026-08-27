import {Prisma} from "@prisma/client";

export const transactionInclude = {
    category: {
        include: {
            parent: true,
        },
    },
    merchant: true,
    sourceAccount: true,
    destinationAccount: true,
} satisfies Prisma.TransactionInclude;

export type TransactionWithRelations =
    Prisma.TransactionGetPayload<{
        include: typeof transactionInclude;
    }>;
