import {getFinancialAccounts} from "../financial-account/financial-account.service";
import {getRecentTransactions} from "../transactions/transaction.service";
import {
    buildExpenseTree,
    buildMonthlyComparison,
    buildYearInvestment,
    calculateInvestmentGoal,
    calculateSavings
} from "./analytics.helpers";
import {
    buildDashboard,
    getCategoriesByIds,
    getCurrentAndPreviousAnalytics,
    getMonthlyAnalyticsData,
    getTopCategoryRows,
    getYearlyAnalyticsData
} from "./analytics.queries";
/* ======================================================
   TYPES
====================================================== */

export type ExpenseChild = {
    id: string;
    name: string;
    total: number;
};

export type ExpenseParent = {
    category: string;
    total: number;
    children: ExpenseChild[];
};

export type InvestmentGoalData = {
    percent: number;
    goalAmount: number;
    invested: number;
    remaining: number;
    progress: number | null;
};

export type MonthlyAnalyticsResponse = {
    totalIncome: number;
    totalExpense: number;
    totalInvestment: number;
    netSavings: number;
    investmentGoal: InvestmentGoalData | null;
    expenseBreakdown: ExpenseParent[];
};

export type YearMonth = {
    month: number;
    income: number;
    expense: number;
    savings: number;
    investment: {
        invested: number;
        goalPercent: number;
        goalAmount: number;
        remaining: number;
        progress: number;
        status: "green" | "yellow" | "orange" | "red";
    };
};

export type YearlyAnalyticsResponse = {
    total: {
        totalIncome: number;
        totalExpense: number;
        totalInvestment: number;
        netSavings: number;
    };
    months: YearMonth[];
};

export type TopCategory = {
    categoryId: string | null;
    name: string;
    total: number;
};

export type MonthlyComparisonResponse = {
    current: {
        totalIncome: number;
        totalExpense: number;
        totalInvestment: number;
        netSavings: number;
    };
    previous: {
        totalIncome: number;
        totalExpense: number;
        totalInvestment: number;
        netSavings: number;
    };
    change: {
        income: { diff: number; percent: number | null };
        expense: { diff: number; percent: number | null };
        investment: { diff: number; percent: number | null };
        savings: { diff: number; percent: number | null };
    };
};

/* ======================================================
   HELPERS
====================================================== */

const toNumber = (value: unknown): number =>
    Number(value ?? 0);

/* ======================================================
   MONTHLY ANALYTICS
====================================================== */

export async function getMonthlyAnalytics(
    userId: string,
    year: number,
    month: number,
): Promise<MonthlyAnalyticsResponse> {

    const {
        analytics,
        goal,
        expenseBreakdown,
    } = await getMonthlyAnalyticsData(
        userId,
        year,
        month,
    );

    const totalIncome =
        toNumber(
            analytics?.totalIncome,
        );

    const totalExpense =
        toNumber(
            analytics?.totalExpense,
        );

    const totalInvestment =
        toNumber(
            analytics?.totalInvestment,
        );

    return {

        totalIncome,

        totalExpense,

        totalInvestment,

        netSavings:
            calculateSavings(
                totalIncome,
                totalExpense,
                totalInvestment,
            ),

        investmentGoal:
            calculateInvestmentGoal({

                totalIncome,

                totalInvestment,

                goalPercent:
                    goal?.goalPercent ??
                    null,

            }),

        expenseBreakdown:
            buildExpenseTree(
                expenseBreakdown,
            ),

    };

}

/* ======================================================
   YEARLY ANALYTICS
====================================================== */

export async function getYearlyAnalytics(
    userId: string,
    year: number,
): Promise<YearlyAnalyticsResponse> {

    const {
        analytics,
        goals,
    } = await getYearlyAnalyticsData(
        userId,
        year,
    );

    const months: YearMonth[] = [];

    const yearlyGoal =
        goals.find(
            goal => goal.month === 0,
        );

    for (let month = 1; month <= 12; month++) {

        const record =
            analytics.find(
                a => a.month === month,
            );

        const goal =
            goals.find(
                g => g.month === month,
            ) ?? yearlyGoal;

        const income =
            toNumber(
                record?.totalIncome,
            );

        const expense =
            toNumber(
                record?.totalExpense,
            );

        const invested =
            toNumber(
                record?.totalInvestment,
            );

        months.push({

            month,

            income,

            expense,

            savings:
                calculateSavings(
                    income,
                    expense,
                    invested,
                ),

            investment:
                buildYearInvestment({

                    income,

                    invested,

                    goalPercent:
                        goal?.goalPercent ?? 0,

                }),

        });

    }

    const totalIncome =
        months.reduce(
            (sum, month) =>
                sum + month.income,
            0,
        );

    const totalExpense =
        months.reduce(
            (sum, month) =>
                sum + month.expense,
            0,
        );

    const totalInvestment =
        months.reduce(
            (sum, month) =>
                sum +
                month.investment.invested,
            0,
        );

    return {

        total: {

            totalIncome,

            totalExpense,

            totalInvestment,

            netSavings:
                calculateSavings(
                    totalIncome,
                    totalExpense,
                    totalInvestment,
                ),

        },

        months,

    };

}

/* ======================================================
   TOP SPENDING CATEGORIES
====================================================== */

export async function getTopSpendingCategories(
    userId: string,
    year: number,
    month: number,
): Promise<TopCategory[]> {

    const rows =
        await getTopCategoryRows(
            userId,
            year,
            month,
        );

    const categoryIds =
        rows
            .map(row => row.categoryId)
            .filter(
                (id): id is string => !!id,
            );

    const categories =
        await getCategoriesByIds(
            userId,
            categoryIds,
        );

    return rows.map(row => {

        const category =
            categories.find(
                c => c.id === row.categoryId,
            );

        return {

            categoryId:
            row.categoryId,

            name:
                category?.name ??
                "Unknown",

            total:
                toNumber(
                    row._sum.amount,
                ),

        };

    });

}


/* ======================================================
   MONTHLY COMPARISON
====================================================== */

export async function getMonthlyComparison(
    userId: string,
    year: number,
    month: number,
): Promise<MonthlyComparisonResponse> {

    const {
        current,
        previous,
    } =
        await getCurrentAndPreviousAnalytics(
            userId,
            year,
            month,
        );

    return buildMonthlyComparison({

        current: {

            income:
                toNumber(
                    current?.totalIncome,
                ),

            expense:
                toNumber(
                    current?.totalExpense,
                ),

            investment:
                toNumber(
                    current?.totalInvestment,
                ),

        },

        previous: {

            income:
                toNumber(
                    previous?.totalIncome,
                ),

            expense:
                toNumber(
                    previous?.totalExpense,
                ),

            investment:
                toNumber(
                    previous?.totalInvestment,
                ),

        },

    });

}

export async function getDashboard(
    userId: string,
    year: number,
    month: number,
) {

    const [
        accounts,
        monthly,
        comparison,
        topCategories,
        recentTransactions,
    ] = await Promise.all([

        getFinancialAccounts(
            userId,
        ),

        getMonthlyAnalytics(
            userId,
            year,
            month,
        ),

        getMonthlyComparison(
            userId,
            year,
            month,
        ),

        getTopSpendingCategories(
            userId,
            year,
            month,
        ),

        getRecentTransactions(
            userId,
            5,
        ),

    ]);

    return buildDashboard({

        accounts,

        monthly,

        comparison,

        topCategories,

        recentTransactions,

    });

}