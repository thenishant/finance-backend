import {createHash} from "node:crypto";
import {FinancialAccountType, Prisma, TransactionSource, TransactionType,} from "@prisma/client";
import {prisma} from "../../../../database/prisma";
import {postTransactionToLedger} from "../../../ledger/ledger.service";
import {updateAnalytics} from "../../../transactions/transaction.service";
import {BankProvider, detectBankProvider,} from "../detector/bank.detector";
import {parseEmail} from "../parsers/parser.factory";
import {resolveTransactionMerchant} from "../../../merchant/merchant.service";
import {transactionInclude} from "../../../transactions/transaction.constants";

export interface GmailEmailForIngestion {
    userId: string;
    gmailMessageId: string;
    sender?: string | null;
    subject?: string | null;
    body: string;
    receivedAt?: Date | null;
}


const PARSER_VERSION = 2;
/**
 * Gmail transaction ingestion.
 *
 * Rules:
 *
 * - Gmail non-transfer transactions MUST have a category.
 * - Gmail transfers intentionally have no category.
 * - If a non-transfer transaction cannot be categorized,
 *   it must NOT be persisted.
 */
export const ingestGmailEmail = async (
    email: GmailEmailForIngestion,
) => {

    const provider =
        detectBankProvider(
            email.sender,
        );


    /**
     * Unsupported bank.
     */
    if (
        provider ===
        BankProvider.UNKNOWN
    ) {
        return {
            status: "unsupported" as const,
        };
    }


    /**
     * Parse email.
     */
    const parsed =
        parseEmail(
            provider,
            email.subject,
            email.body,
        );


    /**
     * Email is not a transaction.
     */
    if (!parsed) {
        return {
            status: "not-a-transaction" as const,
        };
    }


    /**
     * Resolve merchant and category.
     *
     * Transfers are intentionally not categorized.
     *
     * All other Gmail transactions MUST receive
     * a category.
     */
    const merchant =
        await resolveTransactionMerchant({
            userId: email.userId,

            merchantRaw:
            parsed.merchant,

            transactionType:
            parsed.type,

            shouldCategorize:
                parsed.type !==
                TransactionType.TRANSFER,
        });


    /**
     * IMPORTANT:
     *
     * Gmail non-transfer transactions must never
     * be stored without a category.
     *
     * Transfers are the only exception.
     */
    if (
        parsed.type !==
        TransactionType.TRANSFER &&
        !merchant.categoryId
    ) {
        throw new Error(
            `Gmail transaction could not be categorized: ${
                parsed.merchant ??
                "Unknown merchant"
            }`,
        );
    }


    /**
     * Resolve transaction date.
     */
    const date =
        parsed.transactionDate ??
        email.receivedAt ??
        new Date();


    /**
     * Build deterministic fingerprint.
     */
    const fingerprint =
        createHash("sha256")
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

                    parsed.accountLast4 ??
                    "",
                ].join("|"),
            )
            .digest("hex");


    try {

        return await prisma.$transaction(
            async tx => {

                /**
                 * Check whether this Gmail message
                 * was already imported.
                 */
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


                /**
                 * Find the financial account.
                 */
                const sourceAccount =
                    parsed.accountLast4
                        ? await tx.financialAccount.findFirst({
                            where: {
                                userId:
                                email.userId,

                                last4:
                                parsed.accountLast4,

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
                    new Prisma.Decimal(
                        parsed.amount,
                    );


                /**
                 * Existing Gmail transaction.
                 *
                 * Re-run parser and update it with
                 * the latest parsed information.
                 */
                if (existingByMessage) {

                    const transaction =
                        await tx.transaction.update({
                            where: {
                                id:
                                existingByMessage.id,
                            },

                            data: {
                                type:
                                parsed.type,

                                amount,

                                date,

                                year:
                                    date.getFullYear(),

                                month:
                                    date.getMonth() + 1,

                                merchantId:
                                merchant.merchantId,

                                merchantRaw:
                                merchant.merchantRaw,

                                merchantNormalized:
                                merchant.merchantNormalized,

                                categoryId:
                                merchant.categoryId,

                                categoryAssignmentSource:
                                merchant.categoryAssignmentSource,

                                aiCategoryConfidence:
                                merchant.confidence,

                                sourceAccountId:
                                    sourceAccount?.id ??
                                    null,

                                fingerprint,

                                metadata: {
                                    provider,

                                    parserVersion:
                                    PARSER_VERSION,

                                    accountLast4:
                                        parsed.accountLast4 ??
                                        null,

                                    accountType:
                                        parsed.accountType ??
                                        FinancialAccountType.CREDIT_CARD,

                                    accountMatched:
                                        Boolean(
                                            sourceAccount,
                                        ),
                                },
                            },

                            include:
                            transactionInclude,
                        });


                    return {
                        status: "updated" as const,

                        transactionId:
                        transaction.id,
                    };
                }


                /**
                 * New transaction.
                 *
                 * Check fingerprint before creating.
                 */
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


                /**
                 * Create transaction.
                 *
                 * At this point we already know that:
                 *
                 * non-transfer → categoryId exists
                 *
                 * transfer → categoryId may be null
                 */
                const transaction =
                    await tx.transaction.create({
                        data: {
                            userId:
                            email.userId,

                            type:
                            parsed.type,

                            amount,

                            date,

                            year:
                                date.getFullYear(),

                            month:
                                date.getMonth() + 1,

                            merchantId:
                            merchant.merchantId,

                            merchantRaw:
                            merchant.merchantRaw,

                            merchantNormalized:
                            merchant.merchantNormalized,

                            categoryId:
                            merchant.categoryId,

                            categoryAssignmentSource:
                            merchant.categoryAssignmentSource,

                            aiCategoryConfidence:
                            merchant.confidence,

                            source:
                            TransactionSource.GMAIL,

                            sourceAccountId:
                                sourceAccount?.id ??
                                null,

                            gmailMessageId:
                            email.gmailMessageId,

                            fingerprint,

                            metadata: {
                                provider,

                                parserVersion:
                                PARSER_VERSION,

                                accountLast4:
                                    parsed.accountLast4 ??
                                    null,

                                accountType:
                                    parsed.accountType ??
                                    FinancialAccountType.CREDIT_CARD,

                                accountMatched:
                                    Boolean(
                                        sourceAccount,
                                    ),
                            },
                        },

                        include:
                        transactionInclude,
                    });


                /**
                 * Post ledger entries when an account
                 * was successfully matched.
                 */
                if (sourceAccount) {

                    await postTransactionToLedger(
                        tx,

                        email.userId,

                        transaction,

                        amount,
                    );
                }


                /**
                 * Update monthly analytics.
                 */
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

                    transactionId:
                    transaction.id,
                };
            },
        );

    } catch (error) {

        /**
         * Race-condition fallback.
         *
         * Another Gmail worker may have inserted
         * the same transaction concurrently.
         */
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


/**
 * Process a stored Gmail message.
 */
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

            sender:
            gmailMessage.sender,

            subject:
            gmailMessage.subject,

            body:
            gmailMessage.body,

            receivedAt:
                gmailMessage.receivedAt ??
                gmailMessage.createdAt,
        });


    /**
     * Delete the Gmail staging record once
     * the message has been successfully processed
     * or identified as a duplicate.
     *
     * Unsupported and non-transaction emails
     * are retained.
     */
    if (
        result.status !== "unsupported" &&
        result.status !== "not-a-transaction"
    ) {
        await prisma.gmailMessage.delete({
            where: {
                id: gmailMessage.id,
            },
        });
    }


    return result;
};