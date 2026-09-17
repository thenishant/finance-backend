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

    await prisma.$transaction(async tx => {
        /*
         * Find the accounts first.
         *
         * LedgerEntry has a foreign key to FinancialAccount,
         * so the account IDs must be explicitly used when
         * removing ledger entries.
         */
        const accounts = await tx.financialAccount.findMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
            select: {
                id: true,
            },
        });

        const accountIds = accounts.map(
            account => account.id,
        );

        if (accountIds.length > 0) {
            await tx.ledgerEntry.deleteMany({
                where: {
                    financialAccountId: {
                        in: accountIds,
                    },
                },
            });
        }

        /*
         * Remove any remaining ledger entries owned by
         * the test users.
         *
         * This also handles ledger entries that may not be
         * associated with an account through the expected
         * relation.
         */
        await tx.ledgerEntry.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        });

        await tx.transaction.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        });

        await tx.monthlyAnalytics.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        });

        await tx.investmentGoal.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        });

        await tx.merchantMapping.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        });

        await tx.category.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        });

        await tx.gmailAccount.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        });

        /*
         * At this point there should be no LedgerEntry
         * referencing these accounts.
         */
        await tx.financialAccount.deleteMany({
            where: {
                userId: {
                    in: userIds,
                },
            },
        });

        await tx.user.deleteMany({
            where: {
                id: {
                    in: userIds,
                },
            },
        });
    });

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
            "GmailAccount",
            "FinancialAccount",
            "User"
        RESTART IDENTITY
        CASCADE;
    `);

    createdUserIds.clear();
}