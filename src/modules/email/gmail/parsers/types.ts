import {FinancialAccountType, TransactionType,} from "@prisma/client";

export interface ParsedTransaction {
    amount: number;
    type: TransactionType;
    merchant?: string;
    resolveMerchant?: boolean;
    transactionDate?: Date;
    accountLast4?: string;
    accountType?: FinancialAccountType;
}