import {TransactionType} from "@prisma/client";
import {createTransaction} from "../../modules/transactions/transaction.service";


export async function createExpense(
    ctx: Awaited<ReturnType<typeof import("./context").createTestContext>>,
    overrides: Partial<{
        amount: number;
        date: string;
        merchant: string;
        note: string;
    }> = {},
) {
    return createTransaction(ctx.user.id, {
        type: TransactionType.EXPENSE,
        amount: overrides.amount ?? 100,
        date: overrides.date ?? "2026-08-10",
        merchant: overrides.merchant ?? "Amazon",
        note: overrides.note,
        categoryId: ctx.categories.shopping.id,
        sourceAccountId: ctx.accounts.bank.id,
    });
}

export async function createIncome(
    ctx: Awaited<ReturnType<typeof import("./context").createTestContext>>,
    overrides: Partial<{
        amount: number;
        date: string;
        merchant: string;
        note: string;
    }> = {},
) {
    return createTransaction(ctx.user.id, {
        type: TransactionType.INCOME,
        amount: overrides.amount ?? 1000,
        date: overrides.date ?? "2026-08-10",
        merchant: overrides.merchant ?? "Company",
        note: overrides.note,
        categoryId: ctx.categories.salary.id,
        destinationAccountId: ctx.accounts.bank.id,
    });
}

export async function createInvestment(
    ctx: Awaited<ReturnType<typeof import("./context").createTestContext>>,
    overrides: Partial<{
        amount: number;
        date: string;
        merchant: string;
        note: string;
    }> = {},
) {
    return createTransaction(ctx.user.id, {
        type: TransactionType.INVESTMENT,
        amount: overrides.amount ?? 500,
        date: overrides.date ?? "2026-08-10",
        merchant: overrides.merchant ?? "Groww",
        note: overrides.note,
        categoryId: ctx.categories.investment.id,
        sourceAccountId: ctx.accounts.bank.id,
    });
}

export async function createTransfer(
    ctx: Awaited<ReturnType<typeof import("./context").createTestContext>>,
    overrides: Partial<{
        amount: number;
        date: string;
        note: string;
    }> = {},
) {
    return createTransaction(ctx.user.id, {
        type: TransactionType.TRANSFER,
        amount: overrides.amount ?? 1000,
        date: overrides.date ?? "2026-08-10",
        note: overrides.note,
        sourceAccountId: ctx.accounts.bank.id,
        destinationAccountId: ctx.accounts.investment.id,
    });
}