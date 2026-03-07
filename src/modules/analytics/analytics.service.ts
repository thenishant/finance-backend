import {prisma} from "../../database/prisma";

const safeSum = (value: number | null | undefined): number =>
    value ?? 0;

/* ======================================================
   MONTHLY ANALYTICS
====================================================== */

export const getMonthlyAnalytics = async (
    userId: string,
    year: number,
    month: number
) => {

    const [analytics, goal] = await Promise.all([
        prisma.monthlyAnalytics.findUnique({
            where: {
                userId_year_month: {
                    userId,
                    year,
                    month
                }
            }
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

    const totalIncome = analytics?.totalIncome ?? 0;
    const totalExpense = analytics?.totalExpense ?? 0;
    const totalInvestment = analytics?.totalInvestment ?? 0;

    /* ==============================
       Expense Breakdown (category)
    ============================== */

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

    /* ==============================
       Investment Goal
    ============================== */

    const goalPercent = goal?.goalPercent ?? null;

    const goalAmount =
        goalPercent !== null
            ? (totalIncome * goalPercent) / 100
            : null;

    const invested = totalInvestment;

    const remaining =
        goalAmount !== null
            ? Math.max(goalAmount - invested, 0)
            : null;

    const progress =
        goalAmount && goalAmount > 0
            ? Number((invested / goalAmount).toFixed(2))
            : null;

    return {
        totalIncome,
        totalExpense,
        totalInvestment,
        netSavings:
            totalIncome -
            totalExpense -
            totalInvestment,

        investmentGoal: goalPercent
            ? {
                percent: goalPercent,
                goalAmount,
                invested,
                remaining,
                progress
            }
            : null,

        expenseBreakdown
    };
};

/* ======================================================
   YEARLY ANALYTICS
====================================================== */

export const getYearlyAnalytics = async (
    userId: string,
    year: number
) => {

    // const [monthsData, goals] = await Promise.all([
    //
    //     prisma.monthlyAnalytics.findMany({
    //         where: {
    //             userId,
    //             year
    //         },
    //         orderBy: {
    //             month: "asc"
    //         }
    //     }),
    //
    //     prisma.investmentGoal.findMany({
    //         where: {
    //             userId,
    //             year
    //         }
    //     })
    // ]);

    const start = Date.now();

    const [monthsData, goals] = await Promise.all([
        prisma.monthlyAnalytics.findMany({
            where: {userId, year},
            orderBy: {month: "asc"}
        }),
        prisma.investmentGoal.findMany({
            where: {userId, year}
        })
    ]);

    console.log("DB query took:", Date.now() - start, "ms");


    const monthlyMap: Record<number, any> = {};

    for (let m = 1; m <= 12; m++) {

        monthlyMap[m] = {
            month: m,
            income: 0,
            expense: 0,
            savings: 0,
            investment: {
                invested: 0,
                goalPercent: 0,
                goalAmount: 0,
                remaining: 0,
                progress: 0,
                status: "red"
            }
        };
    }

    /* ==============================
       Fill Monthly Analytics
    ============================== */

    for (const m of monthsData) {

        monthlyMap[m.month].income = m.totalIncome;
        monthlyMap[m.month].expense = m.totalExpense;
        monthlyMap[m.month].investment.invested =
            m.totalInvestment;
    }

    /* ==============================
       Resolve Goals
    ============================== */

    const resolveGoal = (month: number) => {

        const monthlyGoal = goals.find(
            g => g.month === month
        );

        if (monthlyGoal) return monthlyGoal.goalPercent;

        const yearlyGoal = goals.find(
            g => g.month === null
        );

        if (yearlyGoal) return yearlyGoal.goalPercent;

        return 0;
    };

    /* ==============================
       Calculate Metrics
    ============================== */

    for (const m of Object.values(monthlyMap)) {

        m.savings =
            m.income -
            m.expense -
            m.investment.invested;

        const goalPercent = resolveGoal(m.month);

        m.investment.goalPercent = goalPercent;

        m.investment.goalAmount =
            m.income * (goalPercent / 100);

        m.investment.remaining =
            Math.max(
                m.investment.goalAmount -
                m.investment.invested,
                0
            );

        m.investment.progress =
            m.investment.goalAmount > 0
                ? m.investment.invested /
                m.investment.goalAmount
                : 0;

        const p = m.investment.progress;

        if (p >= 1) m.investment.status = "green";
        else if (p >= 0.5) m.investment.status = "yellow";
        else if (p > 0) m.investment.status = "orange";
        else m.investment.status = "red";
    }

    const months = Object.values(monthlyMap);

    /* ==============================
       Year Totals
    ============================== */

    const totalIncome =
        months.reduce((a, m) => a + m.income, 0);

    const totalExpense =
        months.reduce((a, m) => a + m.expense, 0);

    const totalInvestment =
        months.reduce(
            (a, m) => a + m.investment.invested,
            0
        );

    return {
        total: {
            totalIncome,
            totalExpense,
            totalInvestment,
            netSavings:
                totalIncome -
                totalExpense -
                totalInvestment
        },
        months
    };
};

/* ======================================================
   TOP SPENDING CATEGORIES
====================================================== */

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

/* ======================================================
   MONTHLY COMPARISON
====================================================== */

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

    const [current, previous] = await Promise.all([

        prisma.monthlyAnalytics.findUnique({
            where: {
                userId_year_month: {
                    userId,
                    year,
                    month
                }
            }
        }),

        prisma.monthlyAnalytics.findUnique({
            where: {
                userId_year_month: {
                    userId,
                    year: prevYear,
                    month: prevMonth
                }
            }
        })
    ]);

    const currIncome = current?.totalIncome ?? 0;
    const currExpense = current?.totalExpense ?? 0;
    const currInvestment = current?.totalInvestment ?? 0;

    const prevIncome = previous?.totalIncome ?? 0;
    const prevExpense = previous?.totalExpense ?? 0;
    const prevInvestment = previous?.totalInvestment ?? 0;

    const currSavings =
        currIncome -
        currExpense -
        currInvestment;

    const prevSavings =
        prevIncome -
        prevExpense -
        prevInvestment;

    const calculateChange = (curr: number, prev: number) => {

        const diff = curr - prev;

        const percent =
            prev === 0
                ? null
                : Number(((diff / prev) * 100).toFixed(2));

        return {diff, percent};
    };

    return {

        current: {
            totalIncome: currIncome,
            totalExpense: currExpense,
            totalInvestment: currInvestment,
            netSavings: currSavings
        },

        previous: {
            totalIncome: prevIncome,
            totalExpense: prevExpense,
            totalInvestment: prevInvestment,
            netSavings: prevSavings
        },

        change: {
            income: calculateChange(currIncome, prevIncome),
            expense: calculateChange(currExpense, prevExpense),
            investment: calculateChange(currInvestment, prevInvestment),
            savings: calculateChange(currSavings, prevSavings)
        }
    };
};