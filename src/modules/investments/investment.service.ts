import {prisma} from "../../database/prisma";

export const setInvestmentGoal = async (
    userId: string,
    year: number,
    goalPercent: number,
    month?: number
) => {

    return prisma.investmentGoal.upsert({
        where: {
            userId_year_month: {
                userId,
                year,
                month: month ?? 0
            }
        },
        update: {
            goalPercent
        },
        create: {
            userId,
            year,
            month: month ?? 0,
            goalPercent
        }
    });
};