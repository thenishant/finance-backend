export enum Transaction {
    INCOME = "INCOME",
    EXPENSE = "EXPENSE",
    INVESTMENT = "INVESTMENT",
    TRANSFER = "TRANSFER"
}

export interface DashboardTransaction {
    id: string;
    merchant: string | null;
    category: string | null;
    amount: number;
    type: Transaction.INCOME | Transaction.EXPENSE | Transaction.INVESTMENT | Transaction.TRANSFER;
    date: string;
}