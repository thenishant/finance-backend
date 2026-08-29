import {ParsedTransaction,} from "../types";

import {detectAxisEmailFormat,} from "./axis.detector";

import {
    parseAxisAccountCredit,
    parseAxisAccountDebit,
    parseAxisBurgundyCredit,
    parseAxisBurgundyDebit,
    parseAxisCreditCard,
} from "./axis.parsers";

import {AxisEmailFormat, AxisParserContext,} from "./axis.type";


export const parseAxisEmail = (
    subject: string,
    body: string,
): ParsedTransaction | null => {

    const format =
        detectAxisEmailFormat(
            subject,
            body,
        );

    if (!format) {
        return null;
    }

    const context: AxisParserContext = {
        subject,
        body,
    };

    switch (format) {

        case AxisEmailFormat.ACCOUNT_DEBIT:
            return parseAxisAccountDebit(
                context,
            );

        case AxisEmailFormat.ACCOUNT_CREDIT:
            return parseAxisAccountCredit(
                context,
            );

        case AxisEmailFormat.CREDIT_CARD:
            return parseAxisCreditCard(
                context,
            );

        case AxisEmailFormat.BURGUNDY_DEBIT:
            return parseAxisBurgundyDebit(
                context,
            );

        case AxisEmailFormat.BURGUNDY_CREDIT:
            return parseAxisBurgundyCredit(
                context,
            );

        default:
            return null;
    }
};