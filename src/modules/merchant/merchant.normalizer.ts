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
    razorpay: "razorpay",
    paytm: "paytm",
    phonepe: "phonepe",
};

export function normalizeMerchantName(name?: string | null): string {
    if (!name) {
        return "";
    }

    let normalized = name.toLowerCase().trim();

    // Remove UPI handles
    normalized = normalized.replace(/@[a-z0-9._-]+/g, " ");

    // Remove URLs
    normalized = normalized.replace(/https?:\/\/\S+/g, " ");

    // Remove emails
    normalized = normalized.replace(/\S+@\S+\.\S+/g, " ");

    // Remove punctuation
    normalized = normalized.replace(/[^a-z0-9\s]/g, " ");

    // Remove standalone numbers
    normalized = normalized.replace(/\b\d+\b/g, " ");

    // Collapse whitespace
    normalized = normalized.replace(/\s+/g, " ").trim();

    const words = normalized
        .split(" ")
        .filter(Boolean)
        .filter((word) => !STOP_WORDS.has(word));

    for (const word of words) {
        if (ALIASES[word]) {
            return ALIASES[word];
        }
    }

    return words.join(" ");
}