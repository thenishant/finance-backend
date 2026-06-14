import {prisma} from "../../../../database/prisma";


import {parseEmail} from "../parsers/parser.factory";
import {BankProvider, detectBankProvider} from "../detector/bank.detector";
import {FinancialAccountType, TransactionSource} from "@prisma/client";

// export const processGmailMessage = async (
//     gmailMessageId: string
// ) => {
//
//     const gmailMessage =
//         await prisma.gmailMessage.findUnique({
//             where: {
//                 id: gmailMessageId
//             },
//             include: {
//                 gmailAccount: true
//             }
//         });
//
//     if (!gmailMessage) {
//         return;
//     }
//
//     if (gmailMessage.processed) {
//         return;
//     }
//
//     const provider =
//         detectBankProvider(
//             gmailMessage.sender
//         );
//
//     if (
//         provider ===
//         BankProvider.UNKNOWN
//     ) {
//         return;
//     }
//
//     const parsed =
//         parseEmail(
//             provider,
//             gmailMessage.subject,
//             gmailMessage.body
//         );
//
//     if (!parsed) {
//         return;
//     }
//
//     const userId =
//         gmailMessage.gmailAccount.userId;
//
//     const fingerprint =
//         crypto
//             .createHash("sha256")
//             .update(
//                 JSON.stringify({
//                     provider,
//                     amount: parsed.amount,
//                     merchant:
//                     parsed.merchant,
//                     subject:
//                     gmailMessage.subject
//                 })
//             )
//             .digest("hex");
//
//     const existing =
//         await prisma.transaction.findUnique({
//             where: {
//                 fingerprint
//             }
//         });
//
//     if (existing) {
//
//         await prisma.gmailMessage.update({
//             where: {
//                 id: gmailMessage.id
//             },
//             data: {
//                 processed: true
//             }
//         });
//
//         return;
//     }
//
//     const now =
//         new Date();
//
//     await prisma.transaction.create({
//         data: {
//             userId,
//
//             source: "GMAIL",
//
//             sourceId: gmailMessage.gmailMessageId,
//
//             fingerprint,
//
//             merchant:
//             parsed.merchant,
//
//             amount:
//             parsed.amount,
//
//             type:
//             parsed.type,
//
//             date: now,
//
//             year:
//                 now.getFullYear(),
//
//             month:
//                 now.getMonth() + 1,
//
//             note:
//             gmailMessage.subject,
//
//             rawEmailId:
//             gmailMessage.id
//         }
//     });
//
//     await prisma.gmailMessage.update({
//         where: {
//             id: gmailMessage.id
//         },
//         data: {
//             processed: true
//         }
//     });
// };

export const processGmailMessage = async (gmailMessageId: string) => {

    const gmailMessage = await prisma.gmailMessage.findUnique({
        where: {
            id: gmailMessageId
        }
    });

    if (!gmailMessage) {
        return;
    }

    const provider = detectBankProvider(gmailMessage.sender);

    if (provider !== BankProvider.AXIS) {
        return;
    }

    const parsed = parseEmail(provider, gmailMessage.subject, gmailMessage.body);

    if (!parsed) {
        return;
    }

    console.log("\n====================");

    console.log({

        // userId,

        type:

        parsed.type,

        amount:

        parsed.amount,

        date:

            parsed.transactionDate!,

        year:

            parsed.transactionDate!

                .getFullYear(),

        month:

            parsed.transactionDate!

                .getMonth() + 1,

        merchant:

        parsed.merchant,

        paymentMethod:

        FinancialAccountType.CREDIT_CARD,

        note:

        gmailMessage.subject,

        source:

        TransactionSource.GMAIL,

        gmailMessageId:

        gmailMessage.id,

        // fingerprint,

        metadata: {

            provider: "AXIS",

            parserVersion: 1

        }

    });

    console.log("====================\n");
};