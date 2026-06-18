import {prisma} from "../../database/prisma";
import {Prisma} from "@prisma/client";

export const getAccountBalance = async (accountId: string): Promise<Prisma.Decimal> => {
    const result =
        await prisma.ledgerEntry.aggregate({
            where: {
                financialAccountId: accountId,
            },
            _sum: {
                amount: true,
            },
        });

    return (
        result._sum.amount ??
        new Prisma.Decimal(0)
    );
};

export const getAccountBalances = async (accountIds: string[]): Promise<Map<string, Prisma.Decimal>> => {
    const balances =
        await prisma.ledgerEntry.groupBy({
            by: ["financialAccountId"],
            where: {
                financialAccountId: {
                    in: accountIds,
                },
            },
            _sum: {
                amount: true,
            },
        });

    return new Map(
        balances.map(balance => [
            balance.financialAccountId,
            balance._sum.amount ??
            new Prisma.Decimal(0),
        ])
    );
};