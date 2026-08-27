import {prisma} from "../../database/prisma";
import {Prisma, TransactionType} from "@prisma/client";
import {transactionInclude} from "../transactions/transaction.constants";

export type ExpenseBreakdownRow = {
    parentId: string | null;
    parentName: string | null;
    childId: string | null;
    childName: string | null;
    total: unknown;
};

export type TransactionWithRelations =
    Prisma.TransactionGetPayload<{
        include: typeof transactionInclude;
    }>;

export async function getMonthlyAnalyticsRecord(
    userId: string,
    year: number,
    month: number,
) {

    return prisma.monthlyAnalytics.findUnique({
        where: {
            userId_year_month: {
                userId,
                year,
                month,
            },
        },
    });

}

export async function getMonthlyInvestmentGoal(
    userId: string,
    year: number,
    month: number,
) {

    return prisma.investmentGoal.findUnique({
        where: {
            userId_year_month: {
                userId,
                year,
                month,
            },
        },
    });

}

export async function getYearlyAnalyticsRecords(
    userId: string,
    year: number,
) {

    return prisma.monthlyAnalytics.findMany({

        where: {
            userId,
            year,
        },

        orderBy: {
            month: "asc",
        },

    });

}

export async function getYearlyInvestmentGoals(
    userId: string,
    year: number,
) {

    return prisma.investmentGoal.findMany({

        where: {
            userId,
            year,
        },

    });

}

export async function getExpenseBreakdown(
    userId: string,
    year: number,
    month: number,
) {

    return prisma.$queryRaw<ExpenseBreakdownRow[]>`

        SELECT parent.id     AS "parentId",
               parent.name   AS "parentName",

               child.id      AS "childId",
               child.name    AS "childName",

               SUM(t.amount) AS total

        FROM "Transaction" t

                 LEFT JOIN "Category" child
                           ON child.id = t."categoryId"

                 LEFT JOIN "Category" parent
                           ON parent.id = child."parentId"

        WHERE t."userId" = ${userId}
          AND t."deletedAt" IS NULL
          AND t."type" = 'EXPENSE'
          AND t."year" = ${year}
          AND t."month" = ${month}

        GROUP BY parent.id,
                 parent.name,
                 child.id,
                 child.name

    `;

}

export async function getTopCategoryRows(
    userId: string,
    year: number,
    month: number,
) {

    return prisma.transaction.groupBy({

        by: ["categoryId"],

        where: {

            userId,

            deletedAt: null,

            type: TransactionType.EXPENSE,

            year,

            month,

        },

        _sum: {
            amount: true,
        },

        orderBy: {

            _sum: {
                amount: "desc",
            },

        },

        take: 5,

    });

}

export async function getCategoriesByIds(
    userId: string,
    categoryIds: string[],
) {

    if (categoryIds.length === 0) {
        return [];
    }

    return prisma.category.findMany({

        where: {

            userId,

            id: {
                in: categoryIds,
            },

        },

        select: {

            id: true,

            name: true,

        },

    });

}

export async function getCurrentAndPreviousAnalytics(
    userId: string,
    year: number,
    month: number,
) {

    let previousYear = year;
    let previousMonth = month - 1;

    if (previousMonth === 0) {
        previousMonth = 12;
        previousYear--;
    }

    const [current, previous] =
        await Promise.all([

            getMonthlyAnalyticsRecord(
                userId,
                year,
                month,
            ),

            getMonthlyAnalyticsRecord(
                userId,
                previousYear,
                previousMonth,
            ),

        ]);

    return {
        current,
        previous,
    };

}

export async function getMonthlyAnalyticsData(
    userId: string,
    year: number,
    month: number,
) {

    const [
        analytics,
        goal,
        expenseBreakdown,
    ] = await Promise.all([

        getMonthlyAnalyticsRecord(
            userId,
            year,
            month,
        ),

        getMonthlyInvestmentGoal(
            userId,
            year,
            month,
        ),

        getExpenseBreakdown(
            userId,
            year,
            month,
        ),

    ]);

    return {

        analytics,

        goal,

        expenseBreakdown,

    };

}

export async function getYearlyAnalyticsData(
    userId: string,
    year: number,
) {

    const [
        analytics,
        goals,
    ] = await Promise.all([

        getYearlyAnalyticsRecords(
            userId,
            year,
        ),

        getYearlyInvestmentGoals(
            userId,
            year,
        ),

    ]);

    return {

        analytics,

        goals,

    };

}

export function buildDashboard({
                                   accounts,
                                   monthly,
                                   comparison,
                                   topCategories,
                                   recentTransactions,
                               }: {
    accounts: any[];
    monthly: {
        totalIncome: number;
        totalExpense: number;
        totalInvestment: number;
        netSavings: number;
    };
    comparison: any;
    topCategories: any[];
    recentTransactions: any[];
}) {

    const accountSummary =
        accounts.map(account => ({

            id: account.id,

            name: account.name,

            type: account.type,

            balance:
                Number(account.balance),

            last4: account.last4,

        }));

    const totalBalance =
        accountSummary.reduce(
            (sum, account) =>
                sum + account.balance,
            0,
        );

    const recent =
        recentTransactions.map(tx => ({

            id: tx.id,

            amount:
                Number(tx.amount),

            type: tx.type,

            merchant:
                tx.merchant?.name ?? null,

            category:
                tx.category?.name ?? null,

            date:
                tx.date instanceof Date
                    ? tx.date.toISOString()
                    : tx.date,

        }));

    return {

        summary: {

            totalBalance,

            monthlyIncome:
            monthly.totalIncome,

            monthlyExpense:
            monthly.totalExpense,

            monthlyInvestment:
            monthly.totalInvestment,

            monthlySavings:
            monthly.netSavings,

        },

        comparison,

        accounts: accountSummary,

        topCategories,

        recentTransactions: recent,

    };

}
