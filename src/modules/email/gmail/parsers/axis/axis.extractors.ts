import {createISTDate} from "../../../../../date";


/* -------------------------------------------------------------------------- */
/* Merchant cleanup                                                           */
/* -------------------------------------------------------------------------- */

const cleanAxisMerchant = (
    value: string,
): string | null => {

    let merchant =
        value
            .replace(/\s+/g, " ")
            .trim();


    /*
     * Axis/Gmail can join the transaction value with
     * the email footer.
     */

    merchant = merchant.replace(
        /\s+(?:Feel\s+free\s+to\s+(?:contact|connect)\b|To\s+check\s+your\s+available\s+balance|For\s+details|Always\s+open\s+to\s+help|Regards|Reach\s+us\s+at|Copyright|Please\s+do\s+not)\b.*$/i,
        "",
    );


    /*
     * Remove trailing punctuation.
     */

    merchant =
        merchant
            .replace(/[.!?]+$/, "")
            .trim();


    return merchant || null;
};


/* -------------------------------------------------------------------------- */
/* UPI merchant cleanup                                                       */
/* -------------------------------------------------------------------------- */

const extractAxisUpiCounterparty = (
    value: string,
): string | null => {

    const normalized =
        value
            .replace(/\s+/g, " ")
            .trim();


    /*
     * Standard Axis UPI formats:
     *
     * UPI/P2M/660615862577/SHAKILA THAPA
     *
     * UPI/P2A/624207512807/DEEPANSHU/SBIN/Birt
     *
     * The transaction reference is NOT a merchant.
     *
     * We therefore take the counterparty immediately after
     * the P2A/P2M reference.
     */

    const slashParts =
        normalized
            .split("/")
            .map(part => part.trim())
            .filter(Boolean);


    if (
        slashParts.length >= 4 &&
        /^UPI$/i.test(slashParts[0]) &&
        /^P2[AM]$/i.test(slashParts[1]) &&
        /^\d{8,}$/.test(slashParts[2])
    ) {

        const counterparty =
            slashParts[3];


        if (!counterparty) {
            return null;
        }


        /*
         * Some Axis descriptions append bank/provider
         * information after the counterparty.
         *
         * We intentionally take only the first counterparty
         * segment instead of turning SBIN/etc. into a merchant.
         */

        return cleanAxisMerchant(
            counterparty,
        );
    }


    /*
     * Some emails can flatten the UPI description:
     *
     * P2M 660615862577 SHAKILA THAPA
     *
     * Handle that form as well.
     */

    const flattenedMatch =
        normalized.match(
            /^UPI\s+P2[AM]\s+\d{8,}\s+(.+)$/i,
        );


    if (flattenedMatch?.[1]) {

        return cleanAxisMerchant(
            flattenedMatch[1],
        );
    }


    /*
     * If this is a UPI value but we cannot safely identify
     * the counterparty, do NOT pass the raw payment reference
     * to merchant resolution.
     */

    if (
        /^UPI\b/i.test(normalized) ||
        /^P2[AM]\b/i.test(normalized)
    ) {
        return null;
    }


    return null;
};


/* -------------------------------------------------------------------------- */
/* Standard Account Transaction Info                                          */
/* -------------------------------------------------------------------------- */

export const extractAxisTransactionInfo = (
    body: string,
): string | null => {

    const match =
        body.match(
            /Transaction\s+Info\s*:\s*([\s\S]*?)(?=\s*(?:If\s+this\s+transaction|To\s+block|For\s+details|Feel\s+free\s+to\s+(?:contact|connect)|Regards|Reach\s+us\s+at|Copyright|Please\s+do\s+not)\b|$)/i,
        );


    if (!match?.[1]) {
        return null;
    }


    let value =
        match[1]
            .replace(/\s+/g, " ")
            .trim();


    /*
     * UPI transaction.
     *
     * Never expose:
     *
     * - P2A
     * - P2M
     * - transaction reference numbers
     * - trailing bank/provider descriptors
     *
     * as merchant names.
     */

    if (
        /^UPI\s*[\/\s]/i.test(value) ||
        /^P2[AM]\s*[\/\s]/i.test(value)
    ) {

        return extractAxisUpiCounterparty(
            value,
        );
    }


    /*
     * POS identifiers such as:
     *
     * pos.11329019@indus
     *
     * don't contain a meaningful merchant name.
     */

    if (
        /^pos\.\d+@(?:indus|[a-z0-9.-]+)$/i.test(
            value,
        )
    ) {
        return null;
    }


    return cleanAxisMerchant(
        value,
    );
};


/* -------------------------------------------------------------------------- */
/* Amount                                                                     */
/* -------------------------------------------------------------------------- */

export const extractAxisAmount = (
    text: string,
    patterns: RegExp[],
): number | null => {

    for (const pattern of patterns) {

        const match =
            text.match(pattern);


        if (!match?.[1]) {
            continue;
        }


        const amount =
            Number(
                match[1]
                    .replace(/,/g, "")
                    .trim(),
            );


        if (
            Number.isFinite(amount) &&
            amount > 0
        ) {
            return amount;
        }
    }


    return null;
};


/* -------------------------------------------------------------------------- */
/* Account / Card Last 4                                                      */
/* -------------------------------------------------------------------------- */

export const extractAxisAccountLast4 = (
    body: string,
): string | null => {

    /*
     * Supports:
     *
     * A/c no. XX0999
     * A/c no. XXXX0999
     * A/c no. **0999
     * Account Number: XX0999
     * Account Number: XXXX0999
     * Credit Card No. XX1256
     * Credit Card No. XXXX1256
     */

    const match =
        body.match(
            /(?:A\/c\s+no\.?|Account\s+Number|Credit\s+Card\s+No\.?)\s*:?\s*[^0-9]*?(\d{4})(?!\d)/i,
        );


    return match?.[1] ?? null;
};


/* -------------------------------------------------------------------------- */
/* Credit Card Merchant                                                       */
/* -------------------------------------------------------------------------- */

export const extractAxisCreditCardMerchant = (
    body: string,
): string | null => {

    const match =
        body.match(
            /Merchant\s+Name\s*:\s*([^\r\n]+)/i,
        );


    if (!match?.[1]) {
        return null;
    }


    let value =
        match[1]
            .replace(/\s+/g, " ")
            .trim();


    value =
        value.replace(
            /\s+(?:Axis\s+Bank\s+Credit\s+Card|Credit\s+Card\s+No\.?|Available\s+Limit|Total\s+Credit\s+Limit)\b.*$/i,
            "",
        );


    return cleanAxisMerchant(
        value,
    );
};


/* -------------------------------------------------------------------------- */
/* Burgundy Counterparty                                                      */
/* -------------------------------------------------------------------------- */

export const extractAxisBurgundyCounterparty = (
    body: string,
): string | null => {

    /*
     * Example:
     *
     * ... debited with INR 14500.00
     * on 27-08-2026 08:30:06 IST by ACH-DR-Indian Clearing Cor.
     *
     * We capture only what follows "by".
     */

    const match =
        body.match(
            /\bby\s+(.+?)(?=\r?\n|$)/i,
        );


    if (!match?.[1]) {
        return null;
    }


    return cleanAxisMerchant(
        match[1],
    );
};


/* -------------------------------------------------------------------------- */
/* Axis Date                                                                  */
/* -------------------------------------------------------------------------- */

export const parseAxisDate = (
    date: string,
    time: string,
): Date | undefined => {

    const dateMatch =
        date.match(
            /^(\d{2})-(\d{2})-(\d{2}|\d{4})$/,
        );


    if (!dateMatch) {
        return undefined;
    }


    const day =
        Number(dateMatch[1]);


    const month =
        Number(dateMatch[2]);


    const yearValue =
        Number(dateMatch[3]);


    const year =
        dateMatch[3].length === 2
            ? 2000 + yearValue
            : yearValue;


    const timeMatch =
        time.match(
            /^(\d{2}):(\d{2}):(\d{2})$/,
        );


    if (!timeMatch) {
        return undefined;
    }


    const hour =
        Number(timeMatch[1]);


    const minute =
        Number(timeMatch[2]);


    const second =
        Number(timeMatch[3]);


    return createISTDate(
        year,
        month - 1,
        day,
        hour,
        minute,
        second,
    );
};


/* -------------------------------------------------------------------------- */
/* Date Extraction                                                            */
/* -------------------------------------------------------------------------- */

export const extractAxisDate = (
    body: string,
): Date | undefined => {

    const match =
        body.match(
            /(\d{2}-\d{2}-(?:\d{2}|\d{4}))[,]?\s+(?:at\s+)?(\d{2}:\d{2}:\d{2})\s+IST/i,
        );


    if (!match) {
        return undefined;
    }


    return parseAxisDate(
        match[1],
        match[2],
    );
};