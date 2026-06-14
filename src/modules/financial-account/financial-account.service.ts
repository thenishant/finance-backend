import {prisma} from "../../database/prisma";
import {CreateFinancialAccountDTO, UpdateFinancialAccountDTO} from "./financial-account.dto";

const getAccountOrThrow = async (userId: string, accountId: string) => {
    const account = await prisma.financialAccount.findFirst({
        where: {
            id: accountId, userId, deletedAt: null
        }
    });
    if (!account) {
        throw new Error("Financial account not found");
    }
    return account;
};

export const createFinancialAccount = async (userId: string, data: CreateFinancialAccountDTO) => {
    return prisma.financialAccount.create({
        data: {
            userId,
            name: data.name,
            nickname: data.nickname,
            institutionName: data.institutionName,
            type: data.type,
            provider: data.provider,
            last4: data.last4,
            currentBalance: data.currentBalance,
            availableBalance: data.availableBalance,
            creditLimit: data.creditLimit
        }
    });
};

export const getFinancialAccounts = async (userId: string) => {

    return prisma.financialAccount.findMany({
        where: {
            userId, deletedAt: null, isArchived: false
        },
        orderBy: [{
            sortOrder: "asc"
        }, {
            createdAt: "asc"
        }]
    });
};

export const getFinancialAccountById = async (userId: string, accountId: string) => {
    return getAccountOrThrow(userId, accountId);
};

export const updateFinancialAccount = async (userId: string, accountId: string, data: UpdateFinancialAccountDTO) => {
    await getAccountOrThrow(userId, accountId);
    return prisma.financialAccount.update({
        where: {
            id: accountId
        },
        data
    });
};

export const archiveFinancialAccount = async (userId: string, accountId: string) => {
    await getAccountOrThrow(userId, accountId);
    return prisma.financialAccount.update({
        where: {
            id: accountId
        },

        data: {
            isArchived: true
        }
    });
};

export const deleteFinancialAccount = async (userId: string, accountId: string) => {
    await getAccountOrThrow(userId, accountId);
    return prisma.financialAccount.update({
        where: {
            id: accountId
        },
        data: {
            deletedAt: new Date()
        }
    });
};

export const getFinancialAccountTransactions = async (
    userId: string,
    accountId: string
) => {
    return prisma.transaction.findMany({
        where: {
            userId,
            deletedAt: null,
            OR: [
                {sourceAccountId: accountId},
                {destinationAccountId: accountId}
            ]
        },
        include: {
            category: true
        },
        orderBy: {
            date: "desc"
        }
    });
};