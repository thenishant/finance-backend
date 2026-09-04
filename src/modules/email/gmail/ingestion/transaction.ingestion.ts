import {createHash} from "node:crypto";

import {FinancialAccountType, Prisma, TransactionSource, TransactionType,} from "@prisma/client";

import {prisma} from "../../../../database/prisma";

import {postTransactionToLedger} from "../../../ledger/ledger.service";
import {updateAnalytics} from "../../../transactions/transaction.service";
import {transactionInclude} from "../../../transactions/transaction.constants";

import {BankProvider, detectBankProvider,} from "../detector/bank.detector";

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

    const isTransfer =
        parsed.type === TransactionType.TRANSFER;

    const merchant = await resolveTransactionMerchant({
        userId: email.userId,
        merchantRaw: parsed.merchant,
        transactionType: parsed.type,
        shouldCategorize: !isTransfer,
        requireCategory: false,
    });

    if (!isTransfer && !merchant.categoryId) {
        console.warn(
            "[Gmail] Transaction imported without category",
            {
                merchant:
                    merchant.merchantRaw ??
                    parsed.merchant ??
                    "Unknown merchant",
                transactionType: parsed.type,
            },
        );
    }

    const date =
        parsed.transactionDate ??
        email.receivedAt ??
        new Date();

    const year = date.getFullYear();
    const month = date.getMonth() + 1;

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

    const amount = new Prisma.Decimal(parsed.amount);

    try {
        return await prisma.$transaction(async (tx) => {
            const existingByMessage =
                await tx.transaction.findUnique({
                    where: {
                        gmailMessageId:
                        email.gmailMessageId,
                    },
                    select: {
                        id: true,
                    },
                });

            const sourceAccount = parsed.accountLast4
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

            const metadata = {
                provider,
                parserVersion: PARSER_VERSION,
                accountLast4:
                    parsed.accountLast4 ?? null,
                accountType:
                    parsed.accountType ??
                    FinancialAccountType.CREDIT_CARD,
                accountMatched: Boolean(sourceAccount),
            };

            const transactionData = {
                type: parsed.type,
                amount,
                date,
                year,
                month,
                merchantId: merchant.merchantId,
                merchantRaw: merchant.merchantRaw,
                categoryId: merchant.categoryId,
                categoryAssignmentSource:
                merchant.categoryAssignmentSource,
                aiCategoryConfidence:
                merchant.confidence,
                sourceAccountId:
                    sourceAccount?.id ?? null,
                fingerprint,
                metadata,
            };

            if (existingByMessage) {
                const transaction =
                    await tx.transaction.update({
                        where: {
                            id: existingByMessage.id,
                        },
                        data: transactionData,
                        include: transactionInclude,
                    });

                return {
                    status: "updated" as const,
                    transactionId: transaction.id,
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
                    transactionId:
                    existingByFingerprint.id,
                };
            }

            const transaction =
                await tx.transaction.create({
                    data: {
                        userId: email.userId,
                        ...transactionData,
                        source: TransactionSource.GMAIL,
                        gmailMessageId:
                        email.gmailMessageId,
                    },
                    include: transactionInclude,
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
        if (
            error instanceof
            Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            return {
                status: "duplicate" as const,
            };
        }

        throw error;
    }
};