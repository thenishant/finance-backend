import {AxisEmailFormat,} from "./axis.type";


const normalizeText = (
    value?: string | null,
): string => {

    return (
        value
            ?.replace(/\s+/g, " ")
            .trim()
        ?? ""
    );
};


export const detectAxisEmailFormat = (
    subject?: string | null,
    body?: string | null,
): AxisEmailFormat | null => {

    const normalizedSubject =
        normalizeText(subject);

    const normalizedBody =
        normalizeText(body);

    const subjectLower =
        normalizedSubject.toLowerCase();

    const combinedText =
        `${normalizedSubject} ${normalizedBody}`;


    /*
     * Ignore obvious non-transaction emails.
     */
    if (
        subjectLower.includes("autopay") ||
        subjectLower.includes("reminder")
    ) {
        return null;
    }


    /*
     * ----------------------------------------------------------------------
     * Burgundy Debit
     * ----------------------------------------------------------------------
     */

    if (
        /debit\s+transaction\s+alert/i.test(
            normalizedSubject,
        )
        ||
        (
            /has\s+been\s+debited\s+with\s+INR\s*[\d,.]+/i.test(
                normalizedBody,
            )
            &&
            /\bby\s+/i.test(
                normalizedBody,
            )
        )
    ) {
        return AxisEmailFormat.BURGUNDY_DEBIT;
    }


    /*
     * ----------------------------------------------------------------------
     * Burgundy Credit
     * ----------------------------------------------------------------------
     */

    if (
        /credit\s+transaction\s+alert/i.test(
            normalizedSubject,
        )
        ||
        (
            /has\s+been\s+credited\s+with\s+INR\s*[\d,.]+/i.test(
                normalizedBody,
            )
            &&
            /\bby\s+/i.test(
                normalizedBody,
            )
        )
    ) {
        return AxisEmailFormat.BURGUNDY_CREDIT;
    }


    /*
     * ----------------------------------------------------------------------
     * Credit Card
     * ----------------------------------------------------------------------
     */

    if (
        (
            /^INR\s+[\d,.]+\s+spent\b/i.test(
                normalizedSubject,
            )
            ||
            /transaction\s+amount:\s*INR\s*[\d,.]+/i.test(
                normalizedBody,
            )
        )
        &&
        /credit\s*card/i.test(
            combinedText,
        )
    ) {
        return AxisEmailFormat.CREDIT_CARD;
    }


    /*
     * ----------------------------------------------------------------------
     * Standard Account Debit
     * ----------------------------------------------------------------------
     */

    if (
        (
            /INR\s+[\d,.]+\s+was\s+debited\b/i.test(
                normalizedSubject,
            )
            ||
            /amount\s+debited:\s*INR\s*[\d,.]+/i.test(
                normalizedBody,
            )
        )
        &&
        (
            /A\/c\s+no/i.test(
                normalizedSubject,
            )
            ||
            /account\s+number\s*:/i.test(
                normalizedBody,
            )
        )
    ) {
        return AxisEmailFormat.ACCOUNT_DEBIT;
    }


    /*
     * ----------------------------------------------------------------------
     * Standard Account Credit
     * ----------------------------------------------------------------------
     */

    if (
        (
            /INR\s+[\d,.]+\s+was\s+credited\b/i.test(
                normalizedSubject,
            )
            ||
            /amount\s+credited:\s*INR\s*[\d,.]+/i.test(
                normalizedBody,
            )
        )
        &&
        (
            /A\/c\s+no/i.test(
                normalizedSubject,
            )
            ||
            /account\s+number\s*:/i.test(
                normalizedBody,
            )
        )
    ) {
        return AxisEmailFormat.ACCOUNT_CREDIT;
    }


    return null;
};