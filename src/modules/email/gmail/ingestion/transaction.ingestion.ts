import {createHash} from "node:crypto";
import {FinancialAccountType, Prisma, TransactionSource, TransactionType,} from "@prisma/client";
import {prisma} from "../../../../database/prisma";
import {deleteLedgerEntries, postLedgerEntries,} from "../../../transactions/transactions.utils";
import {updateAnalytics,} from "../../../transactions/transaction.service";
import {transactionInclude,} from "../../../transactions/transaction.constants";
import {BankProvider, detectBankProvider,} from "../detector/bank.detector";
import {parseEmail,} from "../parsers/parser.factory";
import {resolveTransactionMerchant,} from "../../../merchant/merchant.service";

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

    /*
     * ----------------------------------------------------------------------
     * Detect bank provider
     * ----------------------------------------------------------------------
     */

    const provider =
        detectBankProvider(
            email.sender,
        );


    if (
        provider ===
        BankProvider.UNKNOWN
    ) {

        return {
            status: "unsupported" as const,
        };
    }


    /*
     * ----------------------------------------------------------------------
     * Parse email
     * ----------------------------------------------------------------------
     */

    const parsed =
        parseEmail(
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
        parsed.type ===
        TransactionType.TRANSFER;


    /*
     * ----------------------------------------------------------------------
     * Resolve merchant
     * ----------------------------------------------------------------------
     *
     * The parser decides whether there is a merchant worth resolving.
     *
     * A parser may intentionally return no merchant for values such as:
     *
     *   UPI/P2M/660615862577
     *
     * In that case we preserve no fake merchant and let the transaction
     * remain without merchantId.
     */

    const merchant =
        parsed.resolveMerchant &&
        parsed.merchant

            ? await resolveTransactionMerchant({

                userId:
                email.userId,

                merchantRaw:
                parsed.merchant,

                transactionType:
                parsed.type,

                shouldCategorize:
                    !isTransfer,

                requireCategory:
                    false,
            })

            : {

                merchantId:
                    null,

                merchantRaw:
                    parsed.merchant ??
                    null,

                merchantNormalized:
                    null,

                categoryId:
                    null,

                categoryAssignmentSource:
                    "NONE" as const,

                confidence:
                    null,
            };


    /*
     * ----------------------------------------------------------------------
     * Transaction date
     * ----------------------------------------------------------------------
     */

    const date =
        parsed.transactionDate ??
        email.receivedAt ??
        new Date();


    const year =
        date.getFullYear();


    const month =
        date.getMonth() + 1;


    /*
     * ----------------------------------------------------------------------
     * Fingerprint
     * ----------------------------------------------------------------------
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


    const amount =
        new Prisma.Decimal(
            parsed.amount,
        );


    /*
     * ----------------------------------------------------------------------
     * Database transaction
     * ----------------------------------------------------------------------
     */

    try {

        return await prisma.$transaction(
            async tx => {

                /*
                 * ----------------------------------------------------------
                 * Existing Gmail transaction
                 * ----------------------------------------------------------
                 */

                const existingByMessage =
                    await tx.transaction.findUnique({

                        where: {
                            gmailMessageId:
                            email.gmailMessageId,
                        },

                        include:
                        transactionInclude,
                    });


                /*
                 * ----------------------------------------------------------
                 * Resolve financial account
                 * ----------------------------------------------------------
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

                                isActive:
                                    true,

                                isArchived:
                                    false,

                                deletedAt:
                                    null,
                            },
                        })

                        : null;


                /*
                 * ----------------------------------------------------------
                 * Metadata
                 * ----------------------------------------------------------
                 */

                const metadata = {

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
                };


                /*
                 * ----------------------------------------------------------
                 * New transaction state
                 * ----------------------------------------------------------
                 */

                const transactionData = {

                    type:
                    parsed.type,

                    amount,

                    date,

                    year,

                    month,

                    merchantId:
                    merchant.merchantId,

                    merchantRaw:
                    merchant.merchantRaw,

                    merchantNormalized:
                    merchant.merchantNormalized,

                    categoryId:
                        isTransfer
                            ? null
                            : merchant.categoryId,

                    categoryAssignmentSource:
                    merchant.categoryAssignmentSource,

                    aiCategoryConfidence:
                        isTransfer
                            ? null
                            : merchant.confidence,

                    sourceAccountId:
                        sourceAccount?.id ??
                        null,

                    destinationAccountId:
                        null,

                    fingerprint,

                    metadata,
                };


                /*
                 * ----------------------------------------------------------
                 * Update existing Gmail transaction
                 * ----------------------------------------------------------
                 */

                if (existingByMessage) {

                    await deleteLedgerEntries({

                        tx,

                        transactionId:
                        existingByMessage.id,
                    });


                    await updateAnalytics(
                        tx,

                        email.userId,

                        existingByMessage.year,

                        existingByMessage.month,

                        existingByMessage.type,

                        existingByMessage.amount,

                        "decrement",
                    );


                    const transaction =
                        await tx.transaction.update({

                            where: {

                                id:
                                existingByMessage.id,
                            },

                            data:
                            transactionData,

                            include:
                            transactionInclude,
                        });


                    await postLedgerEntries({

                        tx,

                        userId:
                        email.userId,

                        transaction,

                        amount,
                    });


                    await updateAnalytics(
                        tx,

                        email.userId,

                        transaction.year,

                        transaction.month,

                        transaction.type,

                        transaction.amount,

                        "increment",
                    );


                    return {

                        status:
                            "updated" as const,

                        transactionId:
                        transaction.id,
                    };
                }


                /*
                 * ----------------------------------------------------------
                 * Fingerprint duplicate
                 * ----------------------------------------------------------
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


                if (
                    existingByFingerprint
                ) {

                    return {

                        status:
                            "duplicate" as const,

                        transactionId:
                        existingByFingerprint.id,
                    };
                }


                /*
                 * ----------------------------------------------------------
                 * Create transaction
                 * ----------------------------------------------------------
                 */

                const transaction =
                    await tx.transaction.create({

                        data: {

                            userId:
                            email.userId,

                            ...transactionData,

                            source:
                            TransactionSource.GMAIL,

                            gmailMessageId:
                            email.gmailMessageId,
                        },

                        include:
                        transactionInclude,
                    });


                /*
                 * ----------------------------------------------------------
                 * Ledger
                 * ----------------------------------------------------------
                 */

                await postLedgerEntries({

                    tx,

                    userId:
                    email.userId,

                    transaction,

                    amount,
                });


                /*
                 * ----------------------------------------------------------
                 * Analytics
                 * ----------------------------------------------------------
                 */

                await updateAnalytics(
                    tx,

                    email.userId,

                    transaction.year,

                    transaction.month,

                    transaction.type,

                    transaction.amount,

                    "increment",
                );


                return {

                    status:
                        "created" as const,

                    transactionId:
                    transaction.id,
                };
            },
        );

    } catch (error) {

        /*
         * Gmail messages/fingerprints are unique.
         *
         * If another sync worker inserted the same transaction first,
         * treat the unique constraint violation as a duplicate.
         */

        if (

            error instanceof
            Prisma.PrismaClientKnownRequestError

            &&

            error.code === "P2002"
        ) {

            return {

                status:
                    "duplicate" as const,
            };
        }


        throw error;
    }
};