import {ParsedTransaction} from "./types";
import {TransactionType} from "@prisma/client";

export const parseAxisSubject = (subject?: string | null): ParsedTransaction | null => {

    if (!subject) {
        return null;
    }

    const spentRegex = /INR\s+([\d.]+)\s+spent/i;

    const match = subject.match(spentRegex);

    if (!match) {
        return null;
    }

    return {
        amount: Number(match[1]), type: TransactionType.EXPENSE
    };
};

export const parseAxisEmail = (subject: string, body: string): ParsedTransaction | null => {

    const normalizedSubject = subject.toLowerCase();

    if (normalizedSubject.includes("autopay") || normalizedSubject.includes("reminder")) {
        return null;
    }

    const transactionSubject = /^inr\s+[\d.]+/i;

    if (!transactionSubject.test(subject)) {
        return null;
    }

    const amountMatch = body.match(/Transaction Amount:\s*INR\s*([\d.]+)/i);

    const merchantMatch = body.match(/Merchant Name:\s*(.*?)\s*Axis Bank Credit Card No/i);

    const dateMatch = body.match(/Date\s*&\s*Time:\s*(\d{2}-\d{2}-\d{4}),\s*(\d{2}:\d{2}:\d{2})/i);

    const merchant = merchantMatch?.[1]
        ?.replace(/\s+/g, " ")
        ?.trim();

    let transactionDate: Date | undefined;

    if (dateMatch) {

        const datePart = dateMatch[1];

        const timePart = dateMatch[2];

        const [day, month, year] = datePart
            .split("-")
            .map(Number);

        const [hour, minute, second] = timePart
            .split(":")
            .map(Number);

        transactionDate = new Date(year, month - 1, day, hour, minute, second);
    }

    if (!amountMatch) {
        return null;
    }

    return {
        amount: Number(amountMatch[1]),

        merchant,

        transactionDate,

        type: TransactionType.EXPENSE
    };
};