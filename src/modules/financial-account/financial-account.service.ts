import {Prisma} from "@prisma/client";
import {prisma} from "../../database/prisma";
import {CreateFinancialAccountDTO, UpdateFinancialAccountDTO,} from "./financial-account.dto";
import {getAccountBalance, getAccountBalances,} from "../ledger/account-balance.service";

const getAccountOrThrow = async (
    userId: string,
    accountId: string
) => {
    const account =
        await prisma.financialAccount.findFirst({
            where: {
                id: accountId,
                userId,
                deletedAt: null,
                isArchived: false,
            },
        });

    if (!account) {
        throw new Error(
            "Financial account not found"
        );
    }

    return account;
};

export const createFinancialAccount =
    async (
        userId: string,
        data: CreateFinancialAccountDTO
    ) => {
        return prisma.$transaction(
            async tx => {
                const account =
                    await tx.financialAccount.create(
                        {
                            data: {
                                userId,
                                name: data.name,
                                nickname:
                                data.nickname,
                                institutionName:
                                data.institutionName,
                                type: data.type,
                                provider:
                                data.provider,
                                last4: data.last4,
                                creditLimit:
                                data.creditLimit,
                            },
                        }
                    );

                if (data.currentBalance && data.currentBalance !== 0) {
                    await tx.ledgerEntry.create({
                        data: {
                            userId,
                            financialAccountId:
                            account.id,
                            amount:
                                new Prisma.Decimal(
                                    data.currentBalance
                                ),
                        },
                    });
                }

                return account;
            }
        );
    };

export const getFinancialAccounts =
    async (userId: string) => {
        const accounts =
            await prisma.financialAccount.findMany(
                {
                    where: {
                        userId,
                        deletedAt: null,
                        isArchived: false,
                    },
                    orderBy: [
                        {
                            sortOrder: "asc",
                        },
                        {
                            createdAt: "asc",
                        },
                    ],
                }
            );

        const balanceMap =
            await getAccountBalances(
                accounts.map(a => a.id)
            );

        return accounts.map(account => ({
            ...account,
            balance: (
                balanceMap.get(account.id) ??
                new Prisma.Decimal(0)
            ).toString(),
        }));
    };

export const getFinancialAccountById =
    async (
        userId: string,
        accountId: string
    ) => {
        const account =
            await getAccountOrThrow(
                userId,
                accountId
            );

        const balance =
            await getAccountBalance(
                account.id
            );

        return {
            ...account,
            balance: balance.toString(),
        };
    };

export const updateFinancialAccount =
    async (
        userId: string,
        accountId: string,
        data: UpdateFinancialAccountDTO
    ) => {
        await getAccountOrThrow(
            userId,
            accountId
        );

        return prisma.financialAccount.update(
            {
                where: {
                    id: accountId,
                },
                data: {
                    name: data.name,
                    nickname:
                    data.nickname,
                    institutionName:
                    data.institutionName,
                    provider:
                    data.provider,
                    last4: data.last4,
                    creditLimit:
                    data.creditLimit,
                    type: data.type,
                },
            }
        );
    };

export const archiveFinancialAccount =
    async (
        userId: string,
        accountId: string
    ) => {
        await getAccountOrThrow(
            userId,
            accountId
        );

        return prisma.financialAccount.update(
            {
                where: {
                    id: accountId,
                },
                data: {
                    isArchived: true,
                },
            }
        );
    };

export const deleteFinancialAccount =
    async (
        userId: string,
        accountId: string
    ) => {
        await getAccountOrThrow(
            userId,
            accountId
        );

        return prisma.financialAccount.update(
            {
                where: {
                    id: accountId,
                },
                data: {
                    deletedAt: new Date(),
                },
            }
        );
    };

export const getFinancialAccountTransactions =
    async (
        userId: string,
        accountId: string,
        limit?: number
    ) => {
        await getAccountOrThrow(
            userId,
            accountId
        );

        return prisma.transaction.findMany({
            where: {
                userId,
                deletedAt: null,
                OR: [
                    {
                        sourceAccountId:
                        accountId,
                    },
                    {
                        destinationAccountId:
                        accountId,
                    },
                ],
            },
            take: limit,
            include: {
                category: true,
            },
            orderBy: {
                date: "desc",
            },
        });
    };