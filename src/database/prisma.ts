import {PrismaClient} from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ??
    new PrismaClient({
        log: ["error"],
        transactionOptions: {
            maxWait: 10_000,
            timeout: 15_000,
        },
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}