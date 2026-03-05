import {prisma} from "../../database/prisma";

export const setMonthlyInvestmentGoal = async (
    userId: string,
    year: number,
    month: number,
    goalPercent: number
) => {
    return prisma.investmentGoal.upsert({
        where: {
            userId_year_month: {
                userId,
                year,
                month
            }
        },
        update: {
            goalPercent
        },
        create: {
            userId,
            year,
            month,
            goalPercent
        }
    });
};