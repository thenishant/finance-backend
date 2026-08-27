import {
    createUser,
} from "./factory";

import {FinancialAccountType, TransactionType} from "@prisma/client";
import {prisma} from "../../database/prisma";

export async function createTestContext() {
    const user = await createUser();

    const accountRows = [
        FinancialAccountType.BANK_ACCOUNT,
        FinancialAccountType.BANK_ACCOUNT,
        FinancialAccountType.CREDIT_CARD,
        FinancialAccountType.INVESTMENT,
    ].map((type, index) => ({
        userId: user.id,
        name: `${type}-${user.id}-${index}`,
        type,
        last4: "1234",
    }));

    const categoryRows = [
        {
            name: "Shopping",
            type: TransactionType.EXPENSE,
        },
        {
            name: "Food",
            type: TransactionType.EXPENSE,
        },
        {
            name: "entertainment",
            type: TransactionType.EXPENSE,
        },
        {
            name: "Salary",
            type: TransactionType.INCOME,
        },
        {
            name: "Mutual Fund",
            type: TransactionType.INVESTMENT,
        },
    ].map(category => ({
        userId: user.id,
        ...category,
    }));

    const [accounts, categories] = await Promise.all([
        prisma.financialAccount.createManyAndReturn({
            data: accountRows,
        }),
        prisma.category.createManyAndReturn({
            data: categoryRows,
        }),
        prisma.merchant.createMany({
            data: [
                {name: "Amazon"},
                {name: "Swiggy"},
            ],
            skipDuplicates: true,
        }),
    ]);

    const merchants = await prisma.merchant.findMany({
        where: {
            name: {
                in: ["Amazon", "Swiggy"],
            },
        },
    });

    const [bank, secondBank, creditCard, investmentAccount] =
        accountRows.map(row =>
            accounts.find(account => account.name === row.name)!,
        );

    const findCategory = (name: string) =>
        categories.find(category => category.name === name)!;

    const findMerchant = (name: string) =>
        merchants.find(merchant => merchant.name === name)!;

    return {
        user,

        accounts: {
            bank,
            secondBank,
            creditCard,
            investment: investmentAccount,
        },

        categories: {
            shopping: findCategory("Shopping"),
            food: findCategory("Food"),
            entertainment: findCategory("entertainment"),
            salary: findCategory("Salary"),
            investment: findCategory("Mutual Fund"),
        },

        merchants: {
            amazon: findMerchant("Amazon"),
            swiggy: findMerchant("Swiggy"),
        },
    };
}
