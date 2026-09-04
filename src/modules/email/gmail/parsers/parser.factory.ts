import {BankProvider} from "../detector/bank.detector";
import {parseAxisEmail} from "./axis/axis.parser";
import {parseHdfcEmail} from "./hdfc.parser";
import {ParsedTransaction} from "./types";

export const parseEmail = (
    provider: BankProvider,
    subject: string | null | undefined,
    body: string,
): ParsedTransaction | null => {
    const safeSubject = subject ?? "";

    switch (provider) {
        case BankProvider.AXIS:
            return parseAxisEmail(
                safeSubject,
                body,
            );

        case BankProvider.HDFC:
            return parseHdfcEmail(
                safeSubject,
                body,
            );

        default:
            return null;
    }
};