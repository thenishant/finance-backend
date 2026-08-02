import {Prisma} from "@prisma/client";

export const transactionInclude = {
    category: true,
    merchant: true,
    sourceAccount: true,
    destinationAccount: true,
} satisfies Prisma.TransactionInclude;