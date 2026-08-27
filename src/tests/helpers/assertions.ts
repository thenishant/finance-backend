import {expect} from "vitest";
import {getMonthlyAnalytics} from "../../modules/analytics/analytics.service";
import {prisma} from "../../database/prisma";

export async function expectMonthlyTotals(
    userId: string,
    year: number,
    month: number,
    expected: {
        income?: number;
        expense?: number;
        investment?: number;
    },
) {
    const analytics =
        await getMonthlyAnalytics(
            userId,
            year,
            month,
        );

    expect(analytics.totalIncome)
        .toBe(expected.income ?? 0);

    expect(analytics.totalExpense)
        .toBe(expected.expense ?? 0);

    expect(analytics.totalInvestment)
        .toBe(expected.investment ?? 0);
}

export async function assertTestDatabase() {
    if (process.env.APP_ENV !== "test") {
        throw new Error("Refusing to run tests outside APP_ENV=test.",);
    }
    const result = await prisma.$queryRaw<{ database: string }[]>
        `SELECT current_database() AS database`;

    console.log(`[TEST DB] ${result[0]?.database}`,);
}