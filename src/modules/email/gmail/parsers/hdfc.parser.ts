import {FinancialAccountType, TransactionType,} from "@prisma/client";
import {ParsedTransaction} from "./types";

const parseAmount = (value?: string): number | null => {
    if (!value) {
        return null;
    }

    const amount = Number(value.replace(/,/g, ""));
    return Number.isFinite(amount) && amount > 0
        ? amount
        : null;
};

const parseHdfcDate = (
    value?: string,
): Date | undefined => {

    if (!value) {
        return undefined;
    }

    const months: Record<string, number> = {
        Jan: 0,
        Feb: 1,
        Mar: 2,
        Apr: 3,
        May: 4,
        Jun: 5,
        Jul: 6,
        Aug: 7,
        Sep: 8,
        Oct: 9,
        Nov: 10,
        Dec: 11,
    };

    //
    // 05-Aug-2026
    //

    let match =
        value.match(
            /(\d{2})-([A-Za-z]{3})-(\d{4})/,
        );

    if (match) {
        const [, day, month, year] = match;

        return new Date(
            Number(year),
            months[month],
            Number(day),
        );
    }

    //
    // 10-08-26
    //

    match =
        value.match(
            /(\d{2})-(\d{2})-(\d{2})/,
        );

    if (match) {
        const [, day, month, year] = match;

        return new Date(
            2000 + Number(year),
            Number(month) - 1,
            Number(day),
        );
    }

    //
    // 10 Aug, 2026 at 20:36:49
    //

    match =
        value.match(
            /(\d{1,2})\s([A-Za-z]{3}),\s(\d{4})\sat\s(\d{2}:\d{2}:\d{2})/,
        );

    if (match) {

        const [
            ,
            day,
            month,
            year,
            time,
        ] = match;

        const [
            hour,
            minute,
            second,
        ] = time.split(":").map(Number);

        return new Date(
            Number(year),
            months[month],
            Number(day),
            hour,
            minute,
            second,
        );
    }

    return undefined;
};

export const parseHdfcSubject = (
    subject?: string | null,
): ParsedTransaction | null => {

    if (!subject) {
        return null;
    }

    const debit =
        subject.match(
            /Rs\.?\s*([\d,.]+).*debited/i,
        );

    if (debit) {
        const amount =
            parseAmount(debit[1]);

        return amount
            ? {
                amount,
                type: TransactionType.EXPENSE,
            }
            : null;
    }

    const credit =
        subject.match(
            /Rs\.?\s*([\d,.]+).*credited/i,
        );

    if (credit) {
        const amount =
            parseAmount(credit[1]);

        return amount
            ? {
                amount,
                type: TransactionType.INCOME,
            }
            : null;
    }

    return null;
};

export const parseHdfcEmail = (
    subject: string,
    body: string,
): ParsedTransaction | null => {

    const normalizedBody =
        body.replace(/\s+/g, " ").trim();

    const bodyLower =
        normalizedBody.toLowerCase();
    /* ---------------------------------------------------------------------- */
    /* Bank Account Debit (NACH)                                               */
    /* ---------------------------------------------------------------------- */

    if (
        bodyLower.includes("account number") &&
        bodyLower.includes("with umrn")
    ) {

        const amountMatch =
            normalizedBody.match(
                /Rs\.?\s*([\d,.]+)\s*has\s*been\s*debited/i,
            );

        const accountMatch =
            normalizedBody.match(
                /Account Number\s*[X*]+(\d{4})/i,
            );

        const merchantMatch =
            normalizedBody.match(
                /towards\s*(.*?)\s*with UMRN/i,
            );

        const dateMatch =
            normalizedBody.match(
                /on\s*(\d{2}-[A-Za-z]{3}-\d{4})/i,
            );

        const amount =
            parseAmount(amountMatch?.[1]);

        if (!amount) {
            return null;
        }

        return {
            amount,
            merchant: merchantMatch?.[1]?.trim(),
            resolveMerchant: Boolean(
                merchantMatch?.[1],
            ),
            transactionDate:
                parseHdfcDate(
                    dateMatch?.[1],
                ),
            accountLast4:
                accountMatch?.[1],
            accountType:
            FinancialAccountType.BANK_ACCOUNT,
            type:
            TransactionType.EXPENSE,
        };
    }

    /* ---------------------------------------------------------------------- */
    /* Credit Card Debit                                                      */
    /* ---------------------------------------------------------------------- */

    if (
        bodyLower.includes("credit card ending") &&
        bodyLower.includes("has been debited")
    ) {

        const amountMatch =
            normalizedBody.match(
                /Rs\.?\s*([\d,.]+)\s*has\s*been\s*debited/i,
            );

        const cardMatch =
            normalizedBody.match(
                /Credit Card ending\s*(\d{4})/i,
            );

        const merchantMatch =
            normalizedBody.match(
                /towards\s*(.*?)\s*on\s*\d{1,2}\s*[A-Za-z]{3},/i,
            );

        const dateMatch =
            normalizedBody.match(
                /on\s*(\d{1,2}\s*[A-Za-z]{3},\s*\d{4}\s*at\s*\d{2}:\d{2}:\d{2})/i,
            );

        const amount =
            parseAmount(amountMatch?.[1]);

        if (!amount) {
            return null;
        }

        return {
            amount,
            merchant:
                merchantMatch?.[1]?.trim(),
            resolveMerchant: Boolean(
                merchantMatch?.[1],
            ),
            transactionDate:
                parseHdfcDate(
                    dateMatch?.[1],
                ),
            accountLast4:
                cardMatch?.[1],
            accountType:
            FinancialAccountType.CREDIT_CARD,
            type:
            TransactionType.EXPENSE,
        };
    }

    /* ---------------------------------------------------------------------- */
    /* RuPay Credit Card UPI                                                  */
    /* ---------------------------------------------------------------------- */

    if (
        bodyLower.includes("rupay credit card") &&
        bodyLower.includes("paid to")
    ) {

        const amountMatch =
            normalizedBody.match(
                /Rs\.?\s*([\d,.]+)\s*has\s*been\s*debited/i,
            );

        const cardMatch =
            normalizedBody.match(
                /Credit Card\s*\(ending\s*(\d{4})\)/i,
            );

        const merchantMatch =
            normalizedBody.match(
                /Paid to\s*(.*?)\s*Date:/i
            );

        const dateMatch =
            normalizedBody.match(
                /Date:\s*(\d{2}-\d{2}-\d{2})/i,
            );

        const amount =
            parseAmount(amountMatch?.[1]);

        if (!amount) {
            return null;
        }

        const merchant =
            merchantMatch?.[1]
                ?.replace(/\s+/g, " ")
                .trim();

        return {
            amount,
            merchant,
            resolveMerchant: Boolean(merchant),
            transactionDate: parseHdfcDate(dateMatch?.[1]),
            accountLast4: cardMatch?.[1],
            accountType: FinancialAccountType.CREDIT_CARD,
            type: TransactionType.EXPENSE,
        };
    }

    /* ---------------------------------------------------------------------- */
    /* UPI Debit                                                              */
    /* ---------------------------------------------------------------------- */

    if (bodyLower.includes("upi transaction reference")) {

        const amountMatch =
            normalizedBody.match(
                /Rs\.?\s*([\d,.]+)\s*is\s*debited/i,
            );

        const accountMatch =
            normalizedBody.match(
                /account ending\s*(\d{4})/i,
            );

        const merchantMatch =
            normalizedBody.match(
                /towards\s+VPA.*?\(([^)]+)\)/i,
            ) ??
            normalizedBody.match(
                /towards\s*VPA\s*(.*?)\s*on/i,
            );

        const dateMatch =
            normalizedBody.match(
                /on\s*(\d{2}-\d{2}-\d{2})/i,
            );

        const amount =
            parseAmount(amountMatch?.[1]);

        if (!amount) {
            return null;
        }

        return {
            amount,
            merchant:
                merchantMatch?.[1]?.trim(),
            resolveMerchant: Boolean(
                merchantMatch?.[1],
            ),
            transactionDate:
                parseHdfcDate(
                    dateMatch?.[1],
                ),
            accountLast4:
                accountMatch?.[1],
            accountType:
            FinancialAccountType.BANK_ACCOUNT,
            type:
            TransactionType.EXPENSE,
        };
    }

    console.warn(
        "[HDFC] Unsupported email",
        {
            subject,
            preview: normalizedBody.substring(
                0,
                400,
            ),
        },
    );

    return null;
};