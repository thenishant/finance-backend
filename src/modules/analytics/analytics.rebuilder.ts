import {Prisma, TransactionType} from "@prisma/client";

import {prisma} from "../../database/prisma";

type MonthlyTotals = {
    income: Prisma.Decimal;
    expense: Prisma.Decimal;
    investment: Prisma.Decimal;
    transfer: Prisma.Decimal;
};

export interface AnalyticsMonth {
    year: number;
    month: number;
}

export async function rebuildMonthlyAnalytics(
    tx: Prisma.TransactionClient,
    userId: string,
    months: AnalyticsMonth[],
): Promise<void> {
    const uniqueMonths = Array.from(
        new Map(
            months.map(month => [
                `${month.year}-${month.month}`,
                month,
            ]),
        ).values(),
    );

    for (const {year, month} of uniqueMonths) {
        const totals = await calculateMonthlyTotals(
            tx,
            userId,
            year,
            month,
        );

        await tx.monthlyAnalytics.upsert({
            where: {
                userId_year_month: {
                    userId,
                    year,
                    month,
                },
            },
            update: {
                totalIncome: totals.income,
                totalExpense: totals.expense,
                totalInvestment: totals.investment,
                totalTransfer: totals.transfer,
            },
            create: {
                userId,
                year,
                month,
                totalIncome: totals.income,
                totalExpense: totals.expense,
                totalInvestment: totals.investment,
                totalTransfer: totals.transfer,
            }
        });
    }
}

export const rebuildMonth = async (
    userId: string,
    year: number,
    month: number,
): Promise<void> => {
    await prisma.$transaction(async tx => {
        await rebuildMonthlyAnalytics(
            tx,
            userId,
            [{year, month}],
        );
    });
};

export const rebuildYear = async (userId: string, year: number,): Promise<void> => {
    for (let month = 1; month <= 12; month++) {
        await rebuildMonth(
            userId,
            year,
            month,
        );
    }
};

const calculateMonthlyTotals = async (
    tx: Prisma.TransactionClient,
    userId: string,
    year: number,
    month: number,
): Promise<MonthlyTotals> => {
    const grouped = await tx.transaction.groupBy({
        by: ["type"],
        where: {
            userId,
            year,
            month,
            deletedAt: null,
        },
        _sum: {
            amount: true,
        },
    });

    const totals = {
        income: new Prisma.Decimal(0),
        expense: new Prisma.Decimal(0),
        investment: new Prisma.Decimal(0),
        transfer: new Prisma.Decimal(0),
    };

    for (const row of grouped) {
        const amount = row._sum.amount ?? new Prisma.Decimal(0);

        switch (row.type) {
            case TransactionType.INCOME:
                totals.income = amount;
                break;
            case TransactionType.EXPENSE:
                totals.expense = amount;
                break;
            case TransactionType.INVESTMENT:
                totals.investment = amount;
                break;
            case TransactionType.TRANSFER:
                totals.transfer = amount;
                break;
        }
    }

    return totals;
};
