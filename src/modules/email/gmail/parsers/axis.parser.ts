import {ParsedTransaction} from "./types";
import {FinancialAccountType, TransactionType} from "@prisma/client";

const parseAmount = (value?: string): number | null => {
    if (!value) {
        return null;
    }

    const amount = Number(value.replace(/,/g, ""));

    return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const parseAxisDate = (datePart?: string, timePart?: string): Date | undefined => {
    if (!datePart || !timePart) {
        return undefined;
    }

    const [day, month, rawYear] = datePart.split("-").map(Number);
    const [hour, minute, second] = timePart.split(":").map(Number);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const date = new Date(year, month - 1, day, hour, minute, second);

    return Number.isNaN(date.getTime()) ? undefined : date;
};

export const parseAxisSubject = (subject?: string | null): ParsedTransaction | null => {
    if (!subject) {
        return null;
    }

    const spentRegex = /INR\s+([\d,.]+)\s+spent/i;
    const match = subject.match(spentRegex);
    if (!match) {
        return null;
    }

    const amount = parseAmount(match[1]);
    return amount ? {
        amount, type: TransactionType.EXPENSE
    } : null;
};

export const parseAxisEmail = (subject: string, body: string): ParsedTransaction | null => {

    const normalizedSubject = subject.toLowerCase();

    if (normalizedSubject.includes("autopay") || normalizedSubject.includes("reminder")) {
        return null;
    }

    const accountDebitSubject = /^inr\s+[\d,.]+\s+was debited from your a\/c no\./i;

    if (accountDebitSubject.test(subject)) {
        const amountMatch = body.match(/Amount Debited:\s*INR\s*([\d,.]+)/i);
        const accountMatch = body.match(/Account Number:\s*(?:[X*\s-])*?(\d{4})\b/i);
        const dateMatch = body.match(/Date\s*&\s*Time:\s*(\d{2}-\d{2}-(?:\d{2}|\d{4})),\s*(\d{2}:\d{2}:\d{2})/i);
        const infoMatch = body.match(/Transaction Info:\s*(.*?)(?=\s*(?:If this transaction|To block|Call us|Always open|Regards|$))/i);
        const amount = parseAmount(amountMatch?.[1]);

        if (!amount) {
            return null;
        }

        return {
            amount,
            merchant: infoMatch?.[1]?.replace(/\s+/g, " ").trim(),
            transactionDate: parseAxisDate(dateMatch?.[1], dateMatch?.[2]),
            accountLast4: accountMatch?.[1],
            accountType: FinancialAccountType.BANK_ACCOUNT,
            type: TransactionType.EXPENSE
        };
    }

    const transactionSubject = /^inr\s+[\d,.]+/i;

    if (!transactionSubject.test(subject)) {
        return null;
    }

    const amountMatch = body.match(/Transaction Amount:\s*INR\s*([\d,.]+)/i);
    const merchantMatch = body.match(/Merchant Name:\s*(.*?)\s*Axis Bank Credit Card No\.?/i);
    const dateMatch = body.match(/Date\s*&\s*Time:\s*(\d{2}-\d{2}-\d{4}),\s*(\d{2}:\d{2}:\d{2})/i);
    const cardMatch = body.match(/Axis Bank Credit Card No\.?\s*(?:[X*\s-])*?(\d{4})\b/i);
    const merchant = merchantMatch?.[1]
        ?.replace(/\s+/g, " ")
        ?.trim();

    const amount = parseAmount(amountMatch?.[1]);

    if (!amount) return null;

    return {
        amount,
        merchant,
        transactionDate: parseAxisDate(dateMatch?.[1], dateMatch?.[2]),
        accountLast4: cardMatch?.[1],
        accountType: FinancialAccountType.CREDIT_CARD,
        type: TransactionType.EXPENSE
    };
};
