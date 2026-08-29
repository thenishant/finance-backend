import {BankProvider} from "../detector/bank.detector";
import {parseHdfcEmail} from "./hdfc.parser";
import {ParsedTransaction} from "./types";
import {parseAxisEmail} from "./axis/axis.parser";

// export const parseEmail = (provider: BankProvider, subject?: string | null, body?: string | null) => {
//     switch (provider) {
//         case BankProvider.AXIS:
//             return parseAxisEmail(subject ?? "", body ?? "");
//         case BankProvider.HDFC:
//             return parseHdfcEmail(subject ?? "", body ?? "");
//         default:
//             return null;
//     }
// };

export const parseEmail = (
        provider: BankProvider,
        subject: string | null | undefined,
        body: string,
    ): ParsedTransaction | null => {
        const safeSubject = subject ?? "";

        switch (provider) {
            case BankProvider.AXIS:
                return parseAxisEmail(safeSubject, body,);
            case BankProvider.HDFC:
                return parseHdfcEmail(subject ?? "", body ?? "");
            default:
                return null;
        }
    }
;