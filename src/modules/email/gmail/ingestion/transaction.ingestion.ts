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

const PARSER_VERSION = 2;

export const ingestGmailEmail = async (
    email: GmailEmailForIngestion,
) => {

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

    const merchant = await resolveTransactionMerchant({
        userId: email.userId,
        merchantRaw: parsed.merchant,
        transactionType: parsed.type,
        shouldCategorize:
            parsed.type !== TransactionType.TRANSFER,
    });

    const date =
        parsed.transactionDate ??
        email.receivedAt ??
        new Date();

    const fingerprint = createHash("sha256")
        .update(
            [
                email.userId,
                parsed.type,
                parsed.amount,
                date.toISOString(),
                merchant.merchantId ??
                merchant.merchantRaw ??
                parsed.merchant ??
                "",
                parsed.accountLast4 ?? "",
            ].join("|"),
        )
        .digest("hex");

    try {

        return await prisma.$transaction(async tx => {

            //
            // Fast duplicate checks.
            //
            const existingByMessage =
                await tx.transaction.findUnique({
                    where: {
                        gmailMessageId: email.gmailMessageId,
                    },
                    select: {
                        id: true,
                    },
                });

            if (existingByMessage) {
                return {
                    status: "duplicate" as const,
                    transactionId: existingByMessage.id,
                };
            }

            const existingByFingerprint =
                await tx.transaction.findUnique({
                    where: {
                        fingerprint,
                    },
                    select: {
                        id: true,
                    },
                });

            if (existingByFingerprint) {
                return {
                    status: "duplicate" as const,
                    transactionId: existingByFingerprint.id,
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

            const amount =
                new Prisma.Decimal(parsed.amount);

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
                        categoryAssignmentSource:
                        merchant.categoryAssignmentSource,
                        aiCategoryConfidence:
                        merchant.confidence,

                        source: TransactionSource.GMAIL,

                        sourceAccountId:
                            sourceAccount?.id ?? null,

                        gmailMessageId:
                        email.gmailMessageId,

                        fingerprint,

                        metadata: {
                            provider,
                            parserVersion: PARSER_VERSION,

                            accountLast4:
                                parsed.accountLast4 ??
                                null,

                            accountType:
                                parsed.accountType ??
                                FinancialAccountType.CREDIT_CARD,

                            accountMatched:
                                Boolean(sourceAccount),
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
                transaction.year,
                transaction.month,
                transaction.type,
                amount,
                "increment",
            );

            return {
                status: "created" as const,
                transactionId: transaction.id,
            };
        });

    } catch (error) {

        //
        // Race condition fallback.
        //
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            return {
                status: "duplicate" as const,
            };
        }

        throw error;
    }
};

export const processGmailMessage = async (gmailMessageId: string,) => {
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

    try {
        return await ingestGmailEmail({
            userId: gmailMessage.gmailAccount.userId,
            gmailMessageId: gmailMessage.gmailMessageId,
            sender: gmailMessage.sender,
            subject: gmailMessage.subject,
            body: gmailMessage.body,
            receivedAt:
                gmailMessage.receivedAt ??
                gmailMessage.createdAt,
        });
    } finally {
        await prisma.gmailMessage.delete({
            where: {
                id: gmailMessage.id,
            },
        });
    }
};