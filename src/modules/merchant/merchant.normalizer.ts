const STOP_WORDS = new Set([
    "pvt",
    "private",
    "ltd",
    "limited",
    "llp",
    "inc",
    "corp",
    "corporation",
    "company",
    "co",
    "services",
    "service",
    "technologies",
    "technology",
    "solutions",
    "solution",
    "systems",
    "system",
    "india",
    "payment",
    "payments",
    "online",
]);


/* -------------------------------------------------------------------------- */
/*                         Canonical Merchant Aliases                         */
/* -------------------------------------------------------------------------- */

const ALIASES: Record<string, string> = {

    amazon: "Amazon",
    amzn: "Amazon",

    swiggy: "Swiggy",
    zomato: "Zomato",

    uber: "Uber",
    ola: "Ola",

    netflix: "Netflix",
    spotify: "Spotify",
    youtube: "YouTube",
    google: "Google",
    apple: "Apple",

    flipkart: "Flipkart",
};


/* -------------------------------------------------------------------------- */
/*                              Prefix Removal                                */
/* -------------------------------------------------------------------------- */

const PAYMENT_GATEWAY_PREFIXES = [
    "RAZORPAY",
    "RAZ",
    "RZP",
    "PAYU",
    "PAYTM",
    "BILLDESK",
    "CCAVENUE",
    "CCA",
    "PHONEPE",
    "CASHFREE",
    "AMAZON PAY",
] as const;


const TRANSACTION_PREFIXES = [
    "UPI",
    "POS",
    "ECOM",
    "NEFT",
    "IMPS",
    "CARD",
    "DEBIT CARD",
    "CREDIT CARD",
] as const;


const REPLACEMENTS = [
    /\bPRIVATE LIMITED\b/g,
    /\bPVT LTD\b/g,
    /\bPVT\. LTD\.\b/g,
    /\bLIMITED\b/g,
    /\bLTD\b/g,
];


/* -------------------------------------------------------------------------- */
/*                              Basic Normalizer                              */
/* -------------------------------------------------------------------------- */

export const normalizeMerchant = (
    merchant: string,
): string => {

    let value =
        merchant
            .toUpperCase()
            .trim();


    for (const regex of REPLACEMENTS) {

        value =
            value.replace(
                regex,
                "",
            );
    }


    value =
        value
            .replace(/\s+/g, " ")
            .trim();


    return value;
};


/* -------------------------------------------------------------------------- */
/*                              Prefix Helpers                                */
/* -------------------------------------------------------------------------- */

const escapeRegex = (
    value: string,
): string =>
    value.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
    );


const stripPrefixes = (
    value: string,
    prefixes: readonly string[],
): string => {

    let result =
        value.trim();


    let changed = true;


    while (changed) {

        changed = false;


        for (const prefix of prefixes) {

            const regex =
                new RegExp(
                    `^${escapeRegex(prefix)}(?:[\\s*:/-]+)?`,
                    "i",
                );


            if (
                regex.test(result)
            ) {

                result =
                    result
                        .replace(
                            regex,
                            "",
                        )
                        .trim();

                changed = true;
            }
        }
    }


    return result;
};


/* -------------------------------------------------------------------------- */
/*                     Transaction Reference Detection                        */
/* -------------------------------------------------------------------------- */

/**
 * Values containing only payment/transaction infrastructure
 * are not merchants.
 *
 * Examples:
 *
 *   P2M 660615862577
 *   P2A 624047309652
 *   UPI P2M 660615862577
 *   UPI/P2M/660615862577
 *
 * These must never become Merchant rows.
 */
const isTransactionReferenceOnly = (
    value: string,
): boolean => {

    const normalized =
        value
            .toLowerCase()
            .replace(
                /[^a-z0-9]+/g,
                " ",
            )
            .trim();


    if (!normalized) {
        return true;
    }


    /*
     * UPI/P2M/P2A followed by a numeric reference,
     * with no human-readable merchant/counterparty.
     */

    if (
        /^(?:upi\s+)?p2[am]\s+\d{6,}$/.test(
            normalized,
        )
    ) {
        return true;
    }


    /*
     * A bare long numeric reference is not a merchant.
     */

    if (
        /^\d{6,}$/.test(
            normalized,
        )
    ) {
        return true;
    }


    return false;
};


/* -------------------------------------------------------------------------- */
/*                         Display Name Conversion                            */
/* -------------------------------------------------------------------------- */

const toDisplayName = (
    value: string,
): string => {

    return value
        .split(" ")
        .filter(Boolean)
        .map(word => {

            if (!word) {
                return word;
            }


            return (
                word.charAt(0).toUpperCase() +
                word.slice(1)
            );
        })
        .join(" ");
};


/* -------------------------------------------------------------------------- */
/*                         Merchant Name Normalizer                           */

/* -------------------------------------------------------------------------- */

export function normalizeMerchantName(
    name?: string | null,
): string {

    if (!name) {
        return "";
    }


    let normalized =
        name.trim();


    /*
     * Reject transaction-reference-only values
     * before prefix stripping destroys their context.
     */

    if (
        isTransactionReferenceOnly(
            normalized,
        )
    ) {
        return "";
    }


    normalized =
        stripPrefixes(
            normalized,
            PAYMENT_GATEWAY_PREFIXES,
        );


    normalized =
        stripPrefixes(
            normalized,
            TRANSACTION_PREFIXES,
        );


    /*
     * Prefix stripping may have reduced the value
     * to a transaction reference.
     */

    if (
        isTransactionReferenceOnly(
            normalized,
        )
    ) {
        return "";
    }


    normalized =
        normalized.toLowerCase();


    /*
     * Replace separators before removing punctuation.
     */

    normalized =
        normalized.replace(
            /[-_.]/g,
            " ",
        );


    /*
     * Remove UPI handles.
     */

    normalized =
        normalized.replace(
            /@[a-z0-9._-]+/gi,
            "",
        );


    /*
     * Remove URLs.
     */

    normalized =
        normalized.replace(
            /https?:\/\/\S+/g,
            " ",
        );


    /*
     * Remove emails.
     */

    normalized =
        normalized.replace(
            /\S+@\S+\.\S+/g,
            " ",
        );


    /*
     * Replace punctuation with spaces.
     */

    normalized =
        normalized.replace(
            /[^a-z0-9\s]/g,
            " ",
        );


    /*
     * Collapse whitespace.
     */

    normalized =
        normalized
            .replace(
                /\s+/g,
                " ",
            )
            .trim();


    if (!normalized) {
        return "";
    }


    const words =
        normalized
            .split(" ")
            .filter(Boolean)
            .filter(
                word =>
                    !STOP_WORDS.has(
                        word,
                    ),
            );


    if (
        words.length === 0
    ) {
        return "";
    }


    /*
     * A value that becomes only a transaction reference
     * after cleanup is still not a merchant.
     */

    const cleaned =
        words.join(" ");


    if (
        isTransactionReferenceOnly(
            cleaned,
        )
    ) {
        return "";
    }


    /*
     * Known merchant aliases.
     */

    for (const word of words) {

        const alias =
            ALIASES[word];


        if (alias) {
            return alias;
        }
    }


    /*
     * Unknown merchant:
     *
     * Return a readable canonical representation.
     */

    return toDisplayName(
        [...new Set(words)].join(" "),
    );
}