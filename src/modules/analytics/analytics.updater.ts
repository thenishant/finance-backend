import {Prisma, TransactionType} from "@prisma/client";

export const updateMonthlyAnalytics = async (
    tx: Prisma.TransactionClient,
    userId: string,
    year: number,
    month: number,
    type: TransactionType,
    amount: number,
    operation: "add" | "remove"
) => {

    const value = operation === "add" ? amount : -amount;

    const data: any = {};

    if (type === TransactionType.INCOME)
        data.totalIncome = {increment: value};

    if (type === TransactionType.EXPENSE)
        data.totalExpense = {increment: value};

    if (type === TransactionType.INVESTMENT)
        data.totalInvestment = {increment: value};

    await tx.monthlyAnalytics.upsert({
        where: {
            userId_year_month: {
                userId,
                year,
                month
            }
        },
        update: data,
        create: {
            userId,
            year,
            month,
            totalIncome: type === TransactionType.INCOME ? amount : 0,
            totalExpense: type === TransactionType.EXPENSE ? amount : 0,
            totalInvestment: type === TransactionType.INVESTMENT ? amount : 0
        }
    });
};