import {Prisma, Transaction, TransactionType,} from "@prisma/client";

export const postTransactionToLedger = async (
    tx: Prisma.TransactionClient,
    userId: string,
    trx: Transaction,
    amount: Prisma.Decimal,
) => {
    const entries: Prisma.LedgerEntryCreateManyInput[] = [];

    switch (trx.type) {
        case TransactionType.EXPENSE:
        case TransactionType.INVESTMENT: {
            if (!trx.sourceAccountId) {
                return;
            }

            entries.push({
                userId,
                transactionId: trx.id,
                financialAccountId: trx.sourceAccountId,
                amount: amount.neg(),
            });

            break;
        }

        case TransactionType.INCOME: {
            if (!trx.destinationAccountId) {
                return;
            }

            entries.push({
                userId,
                transactionId: trx.id,
                financialAccountId:
                trx.destinationAccountId,
                amount,
            });

            break;
        }

        case TransactionType.TRANSFER: {
            if (
                !trx.sourceAccountId ||
                !trx.destinationAccountId
            ) {
                return;
            }

            entries.push(
                {
                    userId,
                    transactionId: trx.id,
                    financialAccountId:
                    trx.sourceAccountId,
                    amount: amount.neg(),
                },
                {
                    userId,
                    transactionId: trx.id,
                    financialAccountId:
                    trx.destinationAccountId,
                    amount,
                },
            );

            break;
        }
    }

    if (entries.length === 0) {
        return;
    }

    await tx.ledgerEntry.createMany({
        data: entries,
    });
};