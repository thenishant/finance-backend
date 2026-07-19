import {FinancialAccountType, TransactionType} from "@prisma/client";

export interface ParsedTransaction {
    amount: number;
    merchant?: string;
    merchantRaw?: string;
    transactionDate?: Date;
    reference?: string;
    accountLast4?: string;
    accountType?: FinancialAccountType;
    type: TransactionType;
}