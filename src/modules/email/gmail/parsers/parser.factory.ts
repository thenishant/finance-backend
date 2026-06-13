import {parseAxisEmail} from "./axis.parser";
import {BankProvider} from "../detector/bank.detector";

export const parseEmail = (provider: BankProvider, subject?: string | null, body?: string | null) => {

    switch (provider) {

        case BankProvider.AXIS:
            return parseAxisEmail(subject ?? "", body ?? "");

        default:
            return null;
    }
};