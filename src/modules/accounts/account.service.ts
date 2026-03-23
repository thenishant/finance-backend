import {prisma} from '../../database/prisma';
import {CreateAccountDTO} from './account.dto';

const toNumber = (value: unknown): number =>
    Number(value ?? 0);

export const createAccount = async (
    userId: string,
    data: CreateAccountDTO
) => {

    const account = await prisma.account.create({
        data: {
            userId,
            name: data.name,
            type: data.type,
            balance: data.balance
        }
    });

    return {
        ...account,
        balance: toNumber(account.balance)
    };
};

export const getAccounts = async (userId: string) => {

    const accounts = await prisma.account.findMany({
        where: {
            userId,
            deletedAt: null
        },
        orderBy: {
            createdAt: 'asc'
        }
    });

    return accounts.map(mapAccount);
};

export const deleteAccount = async (
    userId: string,
    accountId: string
) => {

    await prisma.account.updateMany({
        where: {
            id: accountId,
            userId
        },
        data: {
            deletedAt: new Date()
        }
    });

    return {success: true};
};

const mapAccount = (acc: any) => ({
    ...acc,
    balance: Number(acc.balance)
});