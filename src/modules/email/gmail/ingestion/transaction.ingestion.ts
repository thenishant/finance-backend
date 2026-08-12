import {createHash} from "node:crypto";

import {FinancialAccountType, Prisma, TransactionSource, TransactionType,} from "@prisma/client";

import {prisma} from "../../../../database/prisma";
import {postTransactionToLedger} from "../../../ledger/ledger.service";
import {updateAnalytics} from "../../../transactions/transaction.service";
import {BankProvider, detectBankProvider} from "../detector/bank.detector";
import {parseEmail} from "../parsers/parser.factory";
import {resolveTransactionMerchant} from "../../../merchant/merchant.service";

export interface GmailEmailForIngestion {
    userId: string;
    gmailMessageId: string;
    sender?: string | null;
    subject?: string | null;
    body: string;
    receivedAt?: Date | null;
}

export const ingestGmailEmail = async (email: GmailEmailForIngestion) => {
    const provider = detectBankProvider(email.sender);
    if (provider === BankProvider.UNKNOWN) {
        return {
            status: "unsupported" as const,
        };
    }
    const parsed = parseEmail(
        provider,
        email.subject,
        email.body,
    );

    if (!parsed) {
        return {
            status: "not-a-transaction" as const,
        };
    }

    console.info("[Ingest] Processing 1", {
        gmailMessageId: email.gmailMessageId,
        subject: email.subject,
    });

    const shouldCategorizeMerchant = parsed.type !== TransactionType.TRANSFER;

    const merchant =
        await resolveTransactionMerchant({
            userId: email.userId,
            merchantRaw: parsed.merchant,
            transactionType: parsed.type,
            shouldCategorize: shouldCategorizeMerchant,
        });

    const date =
        parsed.transactionDate ??
        email.receivedAt ??
        new Date();

    const fingerprint = createHash("sha256")
        .update(`gmail:${email.userId}:${email.gmailMessageId}`,)
        .digest("hex");

    try {
        return await prisma.$transaction(async tx => {
            const existing =
                await tx.transaction.findUnique({
                    where: {
                        fingerprint,
                    },
                });

            if (existing) {
                return {
                    status: "duplicate" as const,
                    transactionId: existing.id,
                };
            }

            const sourceAccount =
                parsed.accountLast4
                    ? await tx.financialAccount.findFirst({
                        where: {
                            userId: email.userId,
                            last4: parsed.accountLast4,
                            type:
                                parsed.accountType ??
                                FinancialAccountType.CREDIT_CARD,
                            isActive: true,
                            isArchived: false,
                            deletedAt: null,
                        },
                    })
                    : null;

            const amount = new Prisma.Decimal(parsed.amount,);
            const transaction =
                await tx.transaction.create({
                    data: {
                        userId: email.userId,
                        type: parsed.type,
                        amount,
                        date,
                        year: date.getFullYear(),
                        month: date.getMonth() + 1,
                        merchantId: merchant.merchantId,
                        merchantRaw: merchant.merchantRaw,
                        categoryId: merchant.categoryId,
                        categoryAssignmentSource: merchant.categoryAssignmentSource,
                        aiCategoryConfidence: merchant.confidence,
                        source: TransactionSource.GMAIL,
                        sourceAccountId: sourceAccount?.id ?? null,
                        fingerprint,
                        metadata: {
                            provider,
                            parserVersion: 1,
                            accountLast4: parsed.accountLast4 ?? null,
                            accountType: parsed.accountType ?? FinancialAccountType.CREDIT_CARD,
                            accountMatched: Boolean(sourceAccount),
                        },
                    },
                });

            if (sourceAccount) {
                await postTransactionToLedger(
                    tx,
                    email.userId,
                    transaction,
                    amount,
                );
            }

            await updateAnalytics(
                tx,
                email.userId,
                date.getFullYear(),
                date.getMonth() + 1,
                parsed.type,
                amount,
                "increment",
            );

            console.info("[Ingest] Processing 2", {
                gmailMessageId: email.gmailMessageId,
                subject: email.subject,
            });
            return {
                status: "created" as const,
                transactionId: transaction.id,
            };
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            console.error("P2002", error.meta);
        }
        throw error;
    }
};

// This only exists to process and remove email rows created by older versions.
export const processGmailMessage = async (
    gmailMessageId: string,
) => {

    const gmailMessage =
        await prisma.gmailMessage.findUnique({
            where: {
                id: gmailMessageId,
            },
            include: {
                gmailAccount: true,
            },
        });

    if (!gmailMessage) {
        return {
            status: "skipped" as const,
        };
    }

    const result =
        await ingestGmailEmail({
            userId:
            gmailMessage.gmailAccount.userId,
            gmailMessageId:
            gmailMessage.gmailMessageId,
            sender: gmailMessage.sender,
            subject: gmailMessage.subject,
            body: gmailMessage.body,
            receivedAt: gmailMessage.receivedAt ?? gmailMessage.createdAt,
        });

    await prisma.gmailMessage.delete({
        where: {
            id: gmailMessage.id,
        },
    });

    return result;
};