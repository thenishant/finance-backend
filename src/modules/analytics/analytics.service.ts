import {prisma} from "../../database/prisma";

export const getMonthlyAnalytics = async (
    userId: string,
    year: number,
    month: number
) => {

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));

    const transactions = await prisma.transaction.findMany({
        where: {
            userId,
            deletedAt: null,
            date: {
                gte: startDate,
                lt: endDate
            }
        },
        include: {
            category: true
        }
    });

    let totalIncome = 0;
    let totalExpense = 0;
    let totalInvestment = 0;

    for (const trx of transactions) {
        if (trx.type === "INCOME") totalIncome += trx.amount;
        if (trx.type === "EXPENSE") totalExpense += trx.amount;
        if (trx.type === "INVESTMENT") totalInvestment += trx.amount;
    }

    const expenseTransactions = transactions.filter(
        trx => trx.type === "EXPENSE"
    );

    // Group by parent category
    const breakdownMap: Record<string, any> = {};

    for (const trx of expenseTransactions) {

        const category = trx.category;

        if (!category) continue;

        // Get parent
        const parentId = category.parentId ?? category.id;

        if (!breakdownMap[parentId]) {
            breakdownMap[parentId] = {
                parentId,
                parentName: "",
                total: 0,
                children: {}
            };
        }

        breakdownMap[parentId].total += trx.amount;

        if (!breakdownMap[parentId].children[category.id]) {
            breakdownMap[parentId].children[category.id] = {
                id: category.id,
                name: category.name,
                total: 0
            };
        }

        breakdownMap[parentId].children[category.id].total += trx.amount;
    }

    // Fetch parent names
    const parentIds = Object.keys(breakdownMap);

    const parents = await prisma.category.findMany({
        where: {
            id: {in: parentIds}
        }
    });

    for (const parent of parents) {
        breakdownMap[parent.id].parentName = parent.name;
    }

    const expenseBreakdown = Object.values(breakdownMap).map((parent: any) => ({
        category: parent.parentName,
        total: parent.total,
        children: Object.values(parent.children)
    }));

    return {
        totalIncome,
        totalExpense,
        totalInvestment,
        netSavings: totalIncome - totalExpense - totalInvestment,
        expenseBreakdown
    };
};

export const getYearlyAnalytics = async (
    userId: string,
    year: number
) => {

    const startDate = new Date(Date.UTC(year, 0, 1));
    const endDate = new Date(Date.UTC(year + 1, 0, 1));

    const transactions = await prisma.transaction.findMany({
        where: {
            userId,
            deletedAt: null,
            date: {
                gte: startDate,
                lt: endDate
            }
        }
    });

    let totalIncome = 0;
    let totalExpense = 0;
    let totalInvestment = 0;

    for (const trx of transactions) {
        if (trx.type === "INCOME") totalIncome += trx.amount;
        if (trx.type === "EXPENSE") totalExpense += trx.amount;
        if (trx.type === "INVESTMENT") totalInvestment += trx.amount;
    }

    return {
        totalIncome,
        totalExpense,
        totalInvestment,
        netSavings: totalIncome - totalExpense - totalInvestment
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
                lt: endDate
            }
        },
        _sum: {
            amount: true
        },
        orderBy: {
            _sum: {
                amount: "desc"
            }
        },
        take: 5
    });

    const categoryIds = result.map(r => r.categoryId);

    const categories = await prisma.category.findMany({
        where: {id: {in: categoryIds}}
    });

    return result.map(r => {
        const category = categories.find(c => c.id === r.categoryId);
        return {
            categoryId: r.categoryId,
            name: category?.name ?? "Unknown",
            total: r._sum.amount ?? 0
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
        end: new Date(Date.UTC(y, m, 1))
    });

    const currentRange = getRange(year, month);

    let prevYear = year;
    let prevMonth = month - 1;

    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = year - 1;
    }

    const previousRange = getRange(prevYear, prevMonth);

    const aggregate = async (range: { start: Date; end: Date }) => {
        const transactions = await prisma.transaction.findMany({
            where: {
                userId,
                deletedAt: null,
                date: {
                    gte: range.start,
                    lt: range.end
                }
            }
        });

        let income = 0;
        let expense = 0;
        let investment = 0;

        for (const trx of transactions) {
            if (trx.type === "INCOME") income += trx.amount;
            if (trx.type === "EXPENSE") expense += trx.amount;
            if (trx.type === "INVESTMENT") investment += trx.amount;
        }

        return {
            totalIncome: income,
            totalExpense: expense,
            totalInvestment: investment,
            netSavings: income - expense - investment
        };
    };

    const current = await aggregate(currentRange);
    const previous = await aggregate(previousRange);

    const calculateChange = (curr: number, prev: number) => {
        const diff = curr - prev;
        const percent =
            prev === 0 ? null : Number(((diff / prev) * 100).toFixed(2));
        return { diff, percent };
    };

    return {
        current,
        previous,
        change: {
            income: calculateChange(current.totalIncome, previous.totalIncome),
            expense: calculateChange(current.totalExpense, previous.totalExpense),
            investment: calculateChange(
                current.totalInvestment,
                previous.totalInvestment
            ),
            savings: calculateChange(current.netSavings, previous.netSavings)
        }
    };
};