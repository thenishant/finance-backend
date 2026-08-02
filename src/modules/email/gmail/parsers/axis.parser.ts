import {ParsedTransaction} from "./types";
import {FinancialAccountType, TransactionType} from "@prisma/client";

const parseAmount = (value?: string): number | null => {
    if (!value) {
        return null;
    }
    const amount = Number(value.replace(/,/g, ""));
    return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const parseAxisDate = (datePart?: string, timePart?: string,): Date | undefined => {
    if (!datePart || !timePart) {
        return undefined;
    }

    const [day, month, rawYear] = datePart.split("-").map(Number);
    const [hour, minute, second] = timePart.split(":").map(Number);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const date = new Date(year, month - 1, day, hour, minute, second,);

    return Number.isNaN(date.getTime()) ? undefined : date;
};

export const parseAxisSubject = (
    subject?: string | null,
): ParsedTransaction | null => {

    if (!subject) {
        return null;
    }

    const spentMatch = subject.match(/INR\s+([\d,.]+)\s+spent/i);

    if (spentMatch) {
        const amount = parseAmount(spentMatch[1]);
        return amount ? {amount, type: TransactionType.EXPENSE} : null;
    }

    const creditedMatch =
        subject.match(/INR\s+([\d,.]+)\s+was\s+credited/i) ??
        subject.match(/credited\s+with\s+INR\s+([\d,.]+)/i);

    if (creditedMatch) {
        const amount = parseAmount(creditedMatch[1]);

        return amount
            ? {
                amount,
                type: TransactionType.INCOME,
            }
            : null;
    }

    return null;
}

export const parseAxisEmail = (
    subject: string,
    body: string,
): ParsedTransaction | null => {

    const normalizedSubject =
        subject.toLowerCase();

    if (
        normalizedSubject.includes("autopay") ||
        normalizedSubject.includes("reminder")
    ) {
        return null;
    }

    /* ---------------------------------------------------------------------- */
    /* Bank Account Debit                                                     */
    /* ---------------------------------------------------------------------- */

    const accountDebitSubject =
        /^inr\s+[\d,.]+\s+was debited from your a\/c no\./i;

    if (accountDebitSubject.test(subject)) {

        const amountMatch =
            body.match(
                /Amount Debited:\s*INR\s*([\d,.]+)/i,
            );

        const accountMatch =
            body.match(
                /Account Number:\s*(?:[X*\s-])*?(\d{4})\b/i,
            );

        const dateMatch =
            body.match(
                /Date\s*&\s*Time:\s*(\d{2}-\d{2}-(?:\d{2}|\d{4})),\s*(\d{2}:\d{2}:\d{2})/i,
            );

        const infoMatch =
            body.match(
                /Transaction Info:\s*(.*?)(?=\s*(?:If this transaction|To block|Call us|Always open|Regards|$))/is,
            );

        const amount =
            parseAmount(amountMatch?.[1]);

        if (!amount) {
            return null;
        }

        return {
            amount,
            merchant: infoMatch?.[1]?.replace(/\s+/g, " ").trim(),
            resolveMerchant: true,
            transactionDate: parseAxisDate(dateMatch?.[1], dateMatch?.[2],),
            accountLast4: accountMatch?.[1],
            accountType: FinancialAccountType.BANK_ACCOUNT,
            type: TransactionType.EXPENSE,
        };
    }

    /* ---------------------------------------------------------------------- */
    /* Bank Account Credit (Format 1)                                         */
    /* ---------------------------------------------------------------------- */

    const accountCreditSubject =
        /^inr\s+[\d,.]+\s+was credited to your a\/c/i;

    if (accountCreditSubject.test(subject)) {

        const amountMatch =
            body.match(
                /Amount Credited:\s*INR\s*([\d,.]+)/i,
            );

        const accountMatch =
            body.match(
                /Account Number:\s*(?:[X*\s-])*?(\d{4})\b/i,
            );

        const dateMatch =
            body.match(
                /Date\s*&\s*Time:\s*(\d{2}-\d{2}-(?:\d{2}|\d{4})),\s*(\d{2}:\d{2}:\d{2})/i,
            );

        const infoMatch =
            body.match(
                /Transaction Info:\s*(.*?)(?=\s*(?:Feel free|Call us|Always open|Regards|$))/is,
            );

        const amount =
            parseAmount(amountMatch?.[1]);

        if (!amount) {
            return null;
        }

        const transactionInfo = infoMatch?.[1]?.replace(/\s+/g, " ").trim();

        return {
            amount,
            merchant: transactionInfo,
            resolveMerchant: Boolean(transactionInfo),
            transactionDate: parseAxisDate(dateMatch?.[1], dateMatch?.[2],),
            accountLast4: accountMatch?.[1],
            accountType: FinancialAccountType.BANK_ACCOUNT,
            type: TransactionType.INCOME,
        };
    }

    /* ---------------------------------------------------------------------- */
    /* Bank Account Credit (Format 2)                                         */
    /* ---------------------------------------------------------------------- */

    const creditAlertSubject =
        /^credit transaction alert/i;

    if (creditAlertSubject.test(subject)) {

        const amountMatch =
            body.match(
                /credited with INR\s*([\d,.]+)/i,
            );

        const accountMatch =
            body.match(
                /A\/c no\.\s*(?:[X*\s-])*?(\d{4})/i,
            );

        const dateMatch =
            body.match(
                /on\s*(\d{2}-\d{2}-(?:\d{2}|\d{4}))\s*at\s*(\d{2}:\d{2}:\d{2})/i,
            );

        const merchantMatch =
            body.match(
                /by\s*(.*?)(?=\.)/i,
            );

        const amount =
            parseAmount(amountMatch?.[1]);

        if (!amount) {
            return null;
        }

        const merchant = merchantMatch?.[1]?.replace(/\s+/g, " ").trim();

        return {
            amount,
            merchant,
            resolveMerchant: Boolean(merchant),
            transactionDate: parseAxisDate(dateMatch?.[1], dateMatch?.[2],),
            accountLast4: accountMatch?.[1],
            accountType: FinancialAccountType.BANK_ACCOUNT,
            type: TransactionType.INCOME,
        };
    }

    /* ---------------------------------------------------------------------- */
    /* Credit Card Debit                                                      */
    /* ---------------------------------------------------------------------- */

    const transactionSubject =
        /^inr\s+[\d,.]+/i;

    if (!transactionSubject.test(subject)) {
        return null;
    }

    const amountMatch =
        body.match(
            /Transaction Amount:\s*INR\s*([\d,.]+)/i,
        );

    const merchantMatch =
        body.match(
            /Merchant Name:\s*(.*?)\s*Axis Bank Credit Card No\.?/is,
        );

    const dateMatch =
        body.match(
            /Date\s*&\s*Time:\s*(\d{2}-\d{2}-\d{4}),\s*(\d{2}:\d{2}:\d{2})/i,
        );

    const cardMatch =
        body.match(
            /Axis Bank Credit Card No\.?\s*(?:[X*\s-])*?(\d{4})\b/i,
        );

    const amount =
        parseAmount(amountMatch?.[1]);

    if (!amount) {
        return null;
    }

    const merchant = merchantMatch?.[1]?.replace(/\s+/g, " ").trim();

    return {
        amount,
        merchant,
        resolveMerchant: Boolean(merchant),
        transactionDate: parseAxisDate(dateMatch?.[1], dateMatch?.[2],),
        accountLast4: cardMatch?.[1],
        accountType: FinancialAccountType.CREDIT_CARD,
        type: TransactionType.EXPENSE,
    };
};