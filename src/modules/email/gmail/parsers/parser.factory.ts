import {parseAxisEmail} from "./axis.parser";
import {BankProvider} from "../detector/bank.detector";
import {parseHdfcEmail} from "./hdfc.parser";

export const parseEmail = (provider: BankProvider, subject?: string | null, body?: string | null) => {
    switch (provider) {
        case BankProvider.AXIS:
            return parseAxisEmail(subject ?? "", body ?? "");
        case BankProvider.HDFC:
            return parseHdfcEmail(subject ?? "", body ?? "");
        default:
            return null;
    }
};