import {prisma} from "../../database/prisma";

const safeSum = (value: number | null | undefined): number =>
    value ?? 0;

export const getMonthlyAnalytics = async (
    userId: string,
    year: number,
    month: number
) => {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));

    const [totals, breakdown] = await prisma.$transaction([
        prisma.transaction.groupBy({
            by: ["type"],
            where: {
                userId,
                deletedAt: null,
                date: {
                    gte: startDate,
                    lt: endDate,
                },
            },
            _sum: {amount: true},
            orderBy: {type: "asc"},
        }),

        prisma.transaction.groupBy({
            by: ["categoryId"],
            where: {
                userId,
                deletedAt: null,
                type: "EXPENSE",
                date: {
                    gte: startDate,
                    lt: endDate,
                },
            },
            _sum: {amount: true},
            orderBy: {
                _sum: {amount: "desc"},
            },
        }),
    ]);

    const totalIncome =
        safeSum(
            totals.find((t) => t.type === "INCOME")?._sum?.amount
        );

    const totalExpense =
        safeSum(
            totals.find((t) => t.type === "EXPENSE")?._sum?.amount
        );

    const totalInvestment =
        safeSum(
            totals.find((t) => t.type === "INVESTMENT")?._sum?.amount
        );

    const categoryIds = breakdown
        .map((b) => b.categoryId)
        .filter((id): id is string => Boolean(id));

    const categories = categoryIds.length
        ? await prisma.category.findMany({
            where: {id: {in: categoryIds}},
            select: {id: true, name: true},
        })
        : [];

    const expenseBreakdown = breakdown.map((b) => {
        const category = categories.find(
            (c) => c.id === b.categoryId
        );

        return {
            category: category?.name ?? "Unknown",
            total: safeSum(b._sum?.amount),
            children: [],
        };
    });

    return {
        totalIncome,
        totalExpense,
        totalInvestment,
        netSavings:
            totalIncome - totalExpense - totalInvestment,
        expenseBreakdown,
    };
};

export const getYearlyAnalytics = async (
    userId: string,
    year: number
) => {
    const startDate = new Date(Date.UTC(year, 0, 1));
    const endDate = new Date(Date.UTC(year + 1, 0, 1));

    const totals = await prisma.transaction.groupBy({
        by: ["type"],
        where: {
            userId,
            deletedAt: null,
            date: {
                gte: startDate,
                lt: endDate,
            },
        },
        _sum: {amount: true},
        orderBy: {type: "asc"},
    });

    const totalIncome =
        safeSum(
            totals.find((t) => t.type === "INCOME")?._sum?.amount
        );

    const totalExpense =
        safeSum(
            totals.find((t) => t.type === "EXPENSE")?._sum?.amount
        );

    const totalInvestment =
        safeSum(
            totals.find((t) => t.type === "INVESTMENT")?._sum?.amount
        );

    return {
        totalIncome,
        totalExpense,
        totalInvestment,
        netSavings:
            totalIncome - totalExpense - totalInvestment,
    };
};

export const getTopSpendingCategories = async (
    userId: string,
    year: number,
    month: number
) => {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));

    const result = await prisma.transaction.groupBy({
        by: ["categoryId"],
        where: {
            userId,
            deletedAt: null,
            type: "EXPENSE",
            date: {
                gte: startDate,
                lt: endDate,
            },
        },
        _sum: {amount: true},
        orderBy: {
            _sum: {amount: "desc"},
        },
        take: 5,
    });

    const categoryIds = result
        .map((r) => r.categoryId)
        .filter((id): id is string => Boolean(id));

    const categories = categoryIds.length
        ? await prisma.category.findMany({
            where: {id: {in: categoryIds}},
            select: {id: true, name: true},
        })
        : [];

    return result.map((r) => {
        const category = categories.find(
            (c) => c.id === r.categoryId
        );

        return {
            categoryId: r.categoryId,
            name: category?.name ?? "Unknown",
            total: safeSum(r._sum?.amount),
        };
    });
};

export const getMonthlyComparison = async (
    userId: string,
    year: number,
    month: number
) => {
    const getRange = (y: number, m: number) => ({
        start: new Date(Date.UTC(y, m - 1, 1)),
        end: new Date(Date.UTC(y, m, 1)),
    });

    const currentRange = getRange(year, month);

    let prevYear = year;
    let prevMonth = month - 1;

    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = year - 1;
    }

    const previousRange = getRange(prevYear, prevMonth);

    const aggregate = async (
        range: { start: Date; end: Date }
    ) => {
        const totals = await prisma.transaction.groupBy({
            by: ["type"],
            where: {
                userId,
                deletedAt: null,
                date: {
                    gte: range.start,
                    lt: range.end,
                },
            },
            _sum: {amount: true},
            orderBy: {type: "asc"},
        });

        const income =
            safeSum(
                totals.find((t) => t.type === "INCOME")?._sum?.amount
            );

        const expense =
            safeSum(
                totals.find((t) => t.type === "EXPENSE")?._sum?.amount
            );

        const investment =
            safeSum(
                totals.find((t) => t.type === "INVESTMENT")?._sum?.amount
            );

        return {
            totalIncome: income,
            totalExpense: expense,
            totalInvestment: investment,
            netSavings: income - expense - investment,
        };
    };

    const [current, previous] = await Promise.all([
        aggregate(currentRange),
        aggregate(previousRange),
    ]);

    const calculateChange = (curr: number, prev: number) => {
        const diff = curr - prev;
        const percent =
            prev === 0
                ? null
                : Number(((diff / prev) * 100).toFixed(2));

        return {diff, percent};
    };

    return {
        current,
        previous,
        change: {
            income: calculateChange(
                current.totalIncome,
                previous.totalIncome
            ),
            expense: calculateChange(
                current.totalExpense,
                previous.totalExpense
            ),
            investment: calculateChange(
                current.totalInvestment,
                previous.totalInvestment
            ),
            savings: calculateChange(
                current.netSavings,
                previous.netSavings
            ),
        },
    };
};