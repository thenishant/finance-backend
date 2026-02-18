import {prisma} from '../../database/prisma';
import {CreateAccountDTO} from './account.dto';

export const createAccount = async (
    userId: string,
    data: CreateAccountDTO
) => {
    return prisma.account.create({
        data: {
            userId,
            name: data.name,
            type: data.type,
            balance: data.balance
        }
    });
};

export const getAccounts = async (userId: string) => {
    return prisma.account.findMany({
        where: {
            userId,
            deletedAt: null
        },
        orderBy: {
            createdAt: 'asc'
        }
    });
};

export const deleteAccount = async (userId: string, accountId: string) => {
    return prisma.account.updateMany({
        where: {
            id: accountId,
            userId
        },
        data: {
            deletedAt: new Date()
        }
    });
};