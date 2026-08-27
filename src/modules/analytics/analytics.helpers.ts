import {ExpenseParent, InvestmentGoalData, MonthlyComparisonResponse} from "./analytics.service";

export const toNumber = (
    value: unknown,
): number => Number(value ?? 0);

export function calculateSavings(
    income: number,
    expense: number,
    investment: number,
): number {

    return (
        income -
        expense -
        investment
    );

}

export function calculateInvestmentGoal({
                                            totalIncome,
                                            totalInvestment,
                                            goalPercent,
                                        }: {
    totalIncome: number;
    totalInvestment: number;
    goalPercent: number | null;
}): InvestmentGoalData | null {

    if (goalPercent === null) {
        return null;
    }

    const goalAmount =
        (totalIncome * goalPercent) / 100;

    const remaining =
        Math.max(
            goalAmount - totalInvestment,
            0,
        );

    const progress =
        goalAmount > 0
            ? Number(
                (
                    totalInvestment /
                    goalAmount
                ).toFixed(2),
            )
            : null;

    return {
        percent: goalPercent,
        goalAmount,
        invested: totalInvestment,
        remaining,
        progress,
    };

}

export function calculateComparison(
    current: number,
    previous: number,
) {

    const diff =
        current - previous;

    return {
        diff,
        percent:
            previous === 0
                ? null
                : Number(
                    (
                        (diff / previous) *
                        100
                    ).toFixed(2),
                ),
    };

}

export function buildMonthlyComparison({
                                           current,
                                           previous,
                                       }: {
    current: {
        income: number;
        expense: number;
        investment: number;
    };
    previous: {
        income: number;
        expense: number;
        investment: number;
    };
}): MonthlyComparisonResponse {

    const currentSavings =
        calculateSavings(
            current.income,
            current.expense,
            current.investment,
        );

    const previousSavings =
        calculateSavings(
            previous.income,
            previous.expense,
            previous.investment,
        );

    return {

        current: {

            totalIncome:
            current.income,

            totalExpense:
            current.expense,

            totalInvestment:
            current.investment,

            netSavings:
            currentSavings,

        },

        previous: {

            totalIncome:
            previous.income,

            totalExpense:
            previous.expense,

            totalInvestment:
            previous.investment,

            netSavings:
            previousSavings,

        },

        change: {

            income:
                calculateComparison(
                    current.income,
                    previous.income,
                ),

            expense:
                calculateComparison(
                    current.expense,
                    previous.expense,
                ),

            investment:
                calculateComparison(
                    current.investment,
                    previous.investment,
                ),

            savings:
                calculateComparison(
                    currentSavings,
                    previousSavings,
                ),

        },

    };

}

export function buildExpenseTree<
    T extends {
        parentId: string | null;
        parentName: string | null;
        childId: string | null;
        childName: string | null;
        total: unknown;
    },
>(
    rows: T[],
): ExpenseParent[] {
    const parents: Record<
        string,
        ExpenseParent
    > = {};

    for (const row of rows) {

        const amount =
            toNumber(row.total);

        const parentId =
            row.parentId ??
            row.childId ??
            "uncategorized";

        const parentName =
            row.parentName ??
            row.childName ??
            "Uncategorized";

        if (!parents[parentId]) {

            parents[parentId] = {

                category: parentName,

                total: 0,

                children: [],

            };

        }

        parents[parentId].total += amount;

        if (row.childId) {

            parents[parentId].children.push({

                id: row.childId,

                name:
                    row.childName ??
                    "Unknown",

                total: amount,

            });

        }

    }

    return Object.values(
        parents,
    ).sort(
        (a, b) => b.total - a.total,
    );

}

export function resolveInvestmentStatus(
    progress: number,
): "green" | "yellow" | "orange" | "red" {

    if (progress >= 1) {
        return "green";
    }

    if (progress >= 0.5) {
        return "yellow";
    }

    if (progress > 0) {
        return "orange";
    }

    return "red";

}

export function buildYearInvestment({
                                        income,
                                        invested,
                                        goalPercent,
                                    }: {
    income: number;
    invested: number;
    goalPercent: number;
}) {

    const goalAmount =
        income * (goalPercent / 100);

    const remaining =
        Math.max(
            goalAmount - invested,
            0,
        );

    const progress =
        goalAmount > 0
            ? invested / goalAmount
            : 0;

    return {

        invested,

        goalPercent,

        goalAmount,

        remaining,

        progress,

        status:
            resolveInvestmentStatus(
                progress,
            ),

    };

}