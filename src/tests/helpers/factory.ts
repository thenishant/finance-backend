import {FinancialAccountType, MerchantMappingSource, TransactionType,} from "@prisma/client";
import {prisma} from "../../database/prisma";
import {randomUUID} from "node:crypto";

const unique = (prefix: string) => `${prefix}-${randomUUID()}`;

export async function createUser() {
    return prisma.user.create({
        data: {
            email: `${unique("user")}@test.com`,
        },
    });
}

export async function createBankAccount(
    userId: string,
    overrides: Partial<{
        name: string;
        last4: string;
        provider: string | null;
        institutionName: string | null;
        isActive: boolean;
        isArchived: boolean;
    }> = {},
) {
    return prisma.financialAccount.create({
        data: {
            userId,
            name: overrides.name ?? unique("HDFC"),
            type: FinancialAccountType.BANK_ACCOUNT,
            last4: overrides.last4 ?? "1234",
            provider: overrides.provider ?? null,
            institutionName: overrides.institutionName ?? null,
            isActive: overrides.isActive ?? true,
            isArchived: overrides.isArchived ?? false,
        },
    });
}


export async function createInvestmentAccount(
    userId: string,
    overrides: Partial<{
        name: string;
        last4: string;
        provider: string | null;
        institutionName: string | null;
        isActive: boolean;
        isArchived: boolean;
    }> = {},
) {
    return prisma.financialAccount.create({
        data: {
            userId,
            name: overrides.name ?? unique("HDFC"),
            type: FinancialAccountType.INVESTMENT,
            last4: overrides.last4 ?? "1234",
            provider: overrides.provider ?? null,
            institutionName: overrides.institutionName ?? null,
            isActive: overrides.isActive ?? true,
            isArchived: overrides.isArchived ?? false,
        },
    });
}

export async function createCreditCardAccount(
    userId: string,
    overrides: Partial<{
        name: string;
        last4: string;
        provider: string | null;
        institutionName: string | null;
        isActive: boolean;
        isArchived: boolean;
    }> = {},
) {
    return prisma.financialAccount.create({
        data: {
            userId,
            name: overrides.name ?? unique("HDFC"),
            type: FinancialAccountType.CREDIT_CARD,
            last4: overrides.last4 ?? "1234",
            provider: overrides.provider ?? null,
            institutionName: overrides.institutionName ?? null,
            isActive: overrides.isActive ?? true,
            isArchived: overrides.isArchived ?? false,
        },
    });
}

export async function createCategory(
    userId: string,
    name: string,
    type: TransactionType,
    parentId?: string,
) {
    return prisma.category.create({
        data: {
            userId,
            name,
            type,
            parentId,
        },
    });
}

export async function createMerchant(name: string,) {
    return prisma.merchant.upsert({
        where: {
            name,
        },
        update: {},
        create: {
            name,
        },
    });
}

export async function createMerchantMapping(
    userId: string,
    merchantId: string,
    categoryId: string,
) {
    return prisma.merchantMapping.create({
        data: {
            userId,
            merchantId,
            categoryId,
            source: MerchantMappingSource.USER,
        },
    });
}
