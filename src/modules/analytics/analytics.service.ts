import {prisma} from "../../database/prisma";

const safeSum = (value: number | null | undefined): number =>
    value ?? 0;

export const getMonthlyAnalytics = async (
    userId: string,
    year: number,
    month: number
) => {

    const [totals, goal] = await Promise.all([
        prisma.transaction.groupBy({
            by: ["type"],
            where: {
                userId,
                deletedAt: null,
                year,
                month
            },
            _sum: {amount: true},
            orderBy: {type: "asc"}
        }),

        prisma.investmentGoal.findUnique({
            where: {
                userId_year_month: {
                    userId,
                    year,
                    month
                }
            }
        })
    ]);

    const totalIncome =
        safeSum(totals.find(t => t.type === "INCOME")?._sum?.amount);

    const totalExpense =
        safeSum(totals.find(t => t.type === "EXPENSE")?._sum?.amount);

    const totalInvestment =
        safeSum(totals.find(t => t.type === "INVESTMENT")?._sum?.amount);

    const rawBreakdown: any[] = await prisma.$queryRaw`
        SELECT parent.id     as "parentId",
               parent.name   as "parentName",
               child.id      as "childId",
               child.name    as "childName",
               SUM(t.amount) as total
        FROM "Transaction" t
                 JOIN "Category" child
                      ON child.id = t."categoryId"
                 LEFT JOIN "Category" parent
                           ON parent.id = child."parentId"
        WHERE t."userId" = ${userId}
          AND t."deletedAt" IS NULL
          AND t."type" = 'EXPENSE'
          AND t."year" = ${year}
          AND t."month" = ${month}
        GROUP BY parent.id, parent.name, child.id, child.name
        ORDER BY total DESC
    `;

    const parentMap: Record<
        string,
        { category: string; total: number; children: any[] }
    > = {};

    for (const row of rawBreakdown) {

        const parentId = row.parentId ?? row.childId;
        const parentName = row.parentName ?? row.childName;
        const amount = Number(row.total);

        if (!parentMap[parentId]) {
            parentMap[parentId] = {
                category: parentName,
                total: 0,
                children: []
            };
        }

        parentMap[parentId].total += amount;

        if (row.parentId) {
            parentMap[parentId].children.push({
                id: row.childId,
                name: row.childName,
                total: amount
            });
        }
    }

    const expenseBreakdown = Object.values(parentMap);

    const goalPercent = goal?.goalPercent ?? null;

    const goalAmount =
        goalPercent !== null
            ? (totalIncome * goalPercent) / 100
            : null;

    const progress =
        goalAmount && goalAmount > 0
            ? totalInvestment / goalAmount
            : null;

    return {
        totalIncome,
        totalExpense,
        totalInvestment,
        netSavings: totalIncome - totalExpense - totalInvestment,

        investmentGoal: {
            percent: goalPercent,
            goalAmount,
            progress
        },

        expenseBreakdown
    };
};

export const getYearlyAnalytics = async (
    userId: string,
    year: number
) => {

    const totals = await prisma.transaction.groupBy({
        by: ["type"],
        where: {
            userId,
            deletedAt: null,
            year
        },
        _sum: {amount: true},
        orderBy: {type: "asc"}
    });

    const totalIncome =
        safeSum(
            totals.find(t => t.type === "INCOME")?._sum?.amount
        );

    const totalExpense =
        safeSum(
            totals.find(t => t.type === "EXPENSE")?._sum?.amount
        );

    const totalInvestment =
        safeSum(
            totals.find(t => t.type === "INVESTMENT")?._sum?.amount
        );

    return {
        totalIncome,
        totalExpense,
        totalInvestment,
        netSavings:
            totalIncome - totalExpense - totalInvestment
    };
};

export const getTopSpendingCategories = async (
    userId: string,
    year: number,
    month: number
) => {

    const result = await prisma.transaction.groupBy({
        by: ["categoryId"],
        where: {
            userId,
            deletedAt: null,
            type: "EXPENSE",
            year,
            month
        },
        _sum: {amount: true},
        orderBy: {
            _sum: {amount: "desc"}
        },
        take: 5
    });

    const categoryIds = result
        .map(r => r.categoryId)
        .filter((id): id is string => Boolean(id));

    const categories = categoryIds.length
        ? await prisma.category.findMany({
            where: {
                userId,
                id: {in: categoryIds}
            },
            select: {
                id: true,
                name: true
            }
        })
        : [];

    return result.map(r => {

        const category = categories.find(
            c => c.id === r.categoryId
        );

        return {
            categoryId: r.categoryId,
            name: category?.name ?? "Unknown",
            total: safeSum(r._sum?.amount)
        };
    });
};

export const getMonthlyComparison = async (
    userId: string,
    year: number,
    month: number
) => {

    let prevYear = year;
    let prevMonth = month - 1;

    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = year - 1;
    }

    const aggregate = async (
        y: number,
        m: number
    ) => {

        const totals = await prisma.transaction.groupBy({
            by: ["type"],
            where: {
                userId,
                deletedAt: null,
                year: y,
                month: m
            },
            _sum: {amount: true},
            orderBy: {type: "asc"}
        });

        const income =
            safeSum(
                totals.find(t => t.type === "INCOME")?._sum?.amount
            );

        const expense =
            safeSum(
                totals.find(t => t.type === "EXPENSE")?._sum?.amount
            );

        const investment =
            safeSum(
                totals.find(t => t.type === "INVESTMENT")?._sum?.amount
            );

        return {
            totalIncome: income,
            totalExpense: expense,
            totalInvestment: investment,
            netSavings: income - expense - investment
        };
    };

    const [current, previous] = await Promise.all([
        aggregate(year, month),
        aggregate(prevYear, prevMonth)
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
            )
        }
    };
};