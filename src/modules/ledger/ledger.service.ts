import {Prisma, Transaction, TransactionType} from "@prisma/client";

export const postTransactionToLedger = async (
    tx: Prisma.TransactionClient,
    userId: string,
    trx: Transaction,
    amount: Prisma.Decimal
) => {
    const entries: Prisma.LedgerEntryCreateManyInput[] = [];

    switch (trx.type) {
        case TransactionType.EXPENSE:
        case TransactionType.INVESTMENT:
            entries.push({
                userId,
                transactionId: trx.id,
                financialAccountId: trx.sourceAccountId!,
                amount: amount.neg(),
            });
            break;

        case TransactionType.INCOME:
            entries.push({
                userId,
                transactionId: trx.id,
                financialAccountId: trx.destinationAccountId!,
                amount,
            });
            break;

        case TransactionType.TRANSFER:
            entries.push({
                    userId,
                    transactionId: trx.id,
                    financialAccountId: trx.sourceAccountId!,
                    amount: amount.neg()
                },
                {
                    userId,
                    transactionId: trx.id,
                    financialAccountId: trx.destinationAccountId!,
                    amount,
                });
            break;
    }

    await tx.ledgerEntry.createMany({
        data: entries,
    });
};