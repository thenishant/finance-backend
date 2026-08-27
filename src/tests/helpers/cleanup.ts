import {prisma} from "../../database/prisma";

const createdUserIds = new Set<string>();

function assertTestEnvironment() {
    if (process.env.APP_ENV !== "test") {
        throw new Error(
            "Refusing to run tests: APP_ENV must be 'test'.",
        );
    }
}

export function trackTestUser(userId: string) {
    createdUserIds.add(userId);
}

export async function cleanupTestUsers() {
    assertTestEnvironment();

    const userIds = [...createdUserIds];

    if (userIds.length === 0) {
        return;
    }

    await prisma.$transaction([
        prisma.ledgerEntry.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        }),
        prisma.transaction.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        }),
        prisma.monthlyAnalytics.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        }),
        prisma.investmentGoal.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        }),
        prisma.merchantMapping.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        }),
        prisma.category.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        }),
        prisma.gmailMessage.deleteMany({
            where: {
                gmailAccount: {
                    userId: {
                        in: userIds,
                    },
                },
            },
        }),
        prisma.gmailAccount.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        }),
        prisma.financialAccount.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        }),
        prisma.user.deleteMany({
            where: {
                id: {
                    in: userIds,
                },
            },
        }),
    ]);

    userIds.forEach(userId => {
        createdUserIds.delete(userId);
    });
}

export async function cleanupDatabase() {
    assertTestEnvironment();

    await prisma.$executeRawUnsafe(`
        TRUNCATE TABLE
            "LedgerEntry",
            "Transaction",
            "MonthlyAnalytics",
            "InvestmentGoal",
            "MerchantMapping",
            "MerchantAlias",
            "Merchant",
            "Category",
            "GmailMessage",
            "GmailAccount",
            "FinancialAccount",
            "User"
        RESTART IDENTITY
        CASCADE;
    `);

    createdUserIds.clear();
}
