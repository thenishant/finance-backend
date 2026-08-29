import {FinancialAccountType, TransactionType,} from "@prisma/client";

import {ParsedTransaction,} from "../types";

import {AxisParserContext,} from "./axis.type";

import {
    extractAxisAccountLast4,
    extractAxisAmount,
    extractAxisBurgundyCounterparty,
    extractAxisCreditCardMerchant,
    extractAxisDate,
    extractAxisTransactionInfo,
} from "./axis.extractors";


/* -------------------------------------------------------------------------- */
/* Standard Account Debit                                                    */
/* -------------------------------------------------------------------------- */

export const parseAxisAccountDebit = ({
                                          body,
                                      }: AxisParserContext): ParsedTransaction | null => {

    const amount =
        extractAxisAmount(
            body,
            [
                /Amount\s+Debited:\s*INR\s*([\d,.]+)/i,
            ],
        );

    if (amount === null) {
        return null;
    }

    const merchant =
        extractAxisTransactionInfo(body);

    return {
        amount,

        type:
        TransactionType.EXPENSE,

        merchant:
            merchant ?? undefined,

        resolveMerchant:
            Boolean(merchant),

        transactionDate:
            extractAxisDate(body),

        accountLast4:
            extractAxisAccountLast4(body)
            ?? undefined,

        accountType:
        FinancialAccountType.BANK_ACCOUNT,
    };
};


/* -------------------------------------------------------------------------- */
/* Standard Account Credit                                                   */
/* -------------------------------------------------------------------------- */

export const parseAxisAccountCredit = ({
                                           body,
                                       }: AxisParserContext): ParsedTransaction | null => {

    const amount =
        extractAxisAmount(
            body,
            [
                /Amount\s+Credited:\s*INR\s*([\d,.]+)/i,
            ],
        );

    if (amount === null) {
        return null;
    }

    const merchant =
        extractAxisTransactionInfo(body);

    return {
        amount,

        type:
        TransactionType.INCOME,

        merchant:
            merchant ?? undefined,

        resolveMerchant:
            Boolean(merchant),

        transactionDate:
            extractAxisDate(body),

        accountLast4:
            extractAxisAccountLast4(body)
            ?? undefined,

        accountType:
        FinancialAccountType.BANK_ACCOUNT,
    };
};


/* -------------------------------------------------------------------------- */
/* Credit Card                                                                */
/* -------------------------------------------------------------------------- */

export const parseAxisCreditCard = ({
                                        body,
                                    }: AxisParserContext): ParsedTransaction | null => {

    const amount =
        extractAxisAmount(
            body,
            [
                /Transaction\s+Amount:\s*INR\s*([\d,.]+)/i,
            ],
        );

    if (amount === null) {
        return null;
    }

    const merchant =
        extractAxisCreditCardMerchant(body);

    return {
        amount,

        type:
        TransactionType.EXPENSE,

        merchant:
            merchant ?? undefined,

        resolveMerchant:
            Boolean(merchant),

        transactionDate:
            extractAxisDate(body),

        accountLast4:
            extractAxisAccountLast4(body)
            ?? undefined,

        accountType:
        FinancialAccountType.CREDIT_CARD,
    };
};


/* -------------------------------------------------------------------------- */
/* Burgundy Debit                                                             */
/* -------------------------------------------------------------------------- */

export const parseAxisBurgundyDebit = ({
                                           body,
                                       }: AxisParserContext): ParsedTransaction | null => {

    const amount =
        extractAxisAmount(
            body,
            [
                /has\s+been\s+debited\s+with\s+INR\s*([\d,.]+)/i,
            ],
        );

    if (amount === null) {
        return null;
    }

    const merchant =
        extractAxisBurgundyCounterparty(body);

    return {
        amount,

        type:
        TransactionType.EXPENSE,

        merchant:
            merchant ?? undefined,

        resolveMerchant:
            Boolean(merchant),

        transactionDate:
            extractAxisDate(body),

        accountLast4:
            extractAxisAccountLast4(body)
            ?? undefined,

        accountType:
        FinancialAccountType.BANK_ACCOUNT,
    };
};


/* -------------------------------------------------------------------------- */
/* Burgundy Credit                                                            */
/* -------------------------------------------------------------------------- */

export const parseAxisBurgundyCredit = ({
                                            body,
                                        }: AxisParserContext): ParsedTransaction | null => {

    const amount =
        extractAxisAmount(
            body,
            [
                /has\s+been\s+credited\s+with\s+INR\s*([\d,.]+)/i,
            ],
        );

    if (amount === null) {
        return null;
    }

    const merchant =
        extractAxisBurgundyCounterparty(body);

    return {
        amount,

        type:
        TransactionType.INCOME,

        merchant:
            merchant ?? undefined,

        resolveMerchant:
            Boolean(merchant),

        transactionDate:
            extractAxisDate(body),

        accountLast4:
            extractAxisAccountLast4(body)
            ?? undefined,

        accountType:
        FinancialAccountType.BANK_ACCOUNT,
    };
};