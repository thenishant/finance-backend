import {TransactionType} from "@prisma/client";

export interface ParsedTransaction {
    amount: number;
    merchant?: string;
    transactionDate?: Date;
    reference?: string;
    type: TransactionType;
}