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

const ALIASES: Record<string, string> = {
    amazon: "amazon",
    amzn: "amazon",
    swiggy: "swiggy",
    zomato: "zomato",
    uber: "uber",
    ola: "ola",
    netflix: "netflix",
    spotify: "spotify",
    youtube: "youtube",
    google: "google",
    apple: "apple",
    flipkart: "flipkart",
};

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

export const normalizeMerchant = (merchant: string): string => {
    let value = merchant.toUpperCase().trim();
    for (const regex of REPLACEMENTS) {
        value = value.replace(regex, "");
    }
    value = value.replace(/\s+/g, " ").trim();
    return value;
};

const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const stripPrefixes = (
    value: string,
    prefixes: readonly string[],
): string => {
    let result = value.trim();

    let changed = true;

    while (changed) {
        changed = false;

        for (const prefix of prefixes) {
            const regex = new RegExp(
                `^${escapeRegex(prefix)}(?:[\\s*:/-]+)?`,
                "i",
            );

            if (regex.test(result)) {
                result = result.replace(regex, "").trim();
                changed = true;
            }
        }
    }

    return result;
};

export function normalizeMerchantName(name?: string | null): string {
    if (!name) {
        return "";
    }

    let normalized = name.trim();

    normalized = stripPrefixes(normalized, PAYMENT_GATEWAY_PREFIXES);
    normalized = stripPrefixes(normalized, TRANSACTION_PREFIXES);

    normalized = normalized.toLowerCase();

    // Replace separators before removing punctuation
    normalized = normalized.replace(/[-_.]/g, " ");

    // Remove UPI handles
    normalized = normalized.replace(/@[a-z0-9._-]+/gi, "");

    // Remove URLs
    normalized = normalized.replace(/https?:\/\/\S+/g, " ");

    // Remove emails
    normalized = normalized.replace(/\S+@\S+\.\S+/g, " ");

    // Replace punctuation with spaces
    normalized = normalized.replace(/[^a-z0-9\s]/g, " ");

    // Collapse whitespace
    normalized = normalized.replace(/\s+/g, " ").trim();

    if (!normalized) {
        return "";
    }

    const words = normalized
        .split(" ")
        .filter(Boolean)
        .filter((word) => !STOP_WORDS.has(word));

    for (const word of words) {
        const alias = ALIASES[word];

        if (alias) {
            return alias;
        }
    }

    return [...new Set(words)].join(" ");
}