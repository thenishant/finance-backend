import {
    ParsedTransaction,
} from "../types";


export enum AxisEmailFormat {
    ACCOUNT_DEBIT = "ACCOUNT_DEBIT",
    ACCOUNT_CREDIT = "ACCOUNT_CREDIT",
    CREDIT_CARD = "CREDIT_CARD",
    BURGUNDY_DEBIT = "BURGUNDY_DEBIT",
    BURGUNDY_CREDIT = "BURGUNDY_CREDIT",
}


export interface AxisParserContext {
    subject?: string | null;
    body: string;
}


export type AxisParsedTransaction =
    ParsedTransaction;