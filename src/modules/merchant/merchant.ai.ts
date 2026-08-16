import {TransactionType} from "@prisma/client";

import {openai} from "../../lib/openai";
import {MerchantAIResponse, MerchantAIResult, MerchantCategoryOption,} from "./merchant.types";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

/* -------------------------------------------------------------------------- */
/*                         Merchant Resolution Prompt                         */
/* -------------------------------------------------------------------------- */

const MERCHANT_SYSTEM_PROMPT = `
You are an expert at recognizing merchant names from financial transactions.
Your task is to normalize a merchant into its canonical public brand.
Examples:
AMZN MKTPLACE
→ Amazon
AMAZON SELLER SERVICES PRIVATE LIMITED
→ Amazon
SWIGGY LIMITED
→ Swiggy
FLIPKART INTERNET PRIVATE LIMITED
→ Flipkart
NETFLIX.COM
→ Netflix
Rules:
1. Return the public brand only.
2. Remove legal suffixes.
3. Remove payment gateway prefixes.
4. Never invent a merchant.
5. Preserve correct capitalization.
6. Confidence must be between 0 and 1.
7. Return ONLY valid JSON.
Return format:
{
    "merchant": "Amazon",
    "confidence": 0.99
}
`;

/* -------------------------------------------------------------------------- */
/*                        Merchant Categorization Prompt                      */
/* -------------------------------------------------------------------------- */

const CATEGORY_SYSTEM_PROMPT = `
You are an expert financial transaction categorization assistant.
Your task is to classify a merchant into ONE existing category.
You will receive a list of leaf categories. Each category has:
- id (must be returned exactly as provided)
- path (full hierarchy)
Examples:
Transport > Fuel
Transport > Fastag
Food > Restaurants
Food > Groceries
Rules:
1. Select exactly ONE category.
2. Always choose the MOST SPECIFIC category.
3. Never invent or modify category IDs.
4. Never return a parent category.
5. Use the full path to understand the context.
6. If multiple categories seem suitable, choose the closest semantic match.
7. Confidence must be between 0 and 1.
8. Return ONLY valid JSON.
9. Do not guess a specific category without reasonable evidence.

Return format:
{
    "categoryId":"...",
    "confidence":0.97,
    "reasoning":"..."
}
`;

/* -------------------------------------------------------------------------- */
/*                           Resolve Merchant (AI)                            */
/* -------------------------------------------------------------------------- */

export const resolveMerchantWithAI = async (
    merchantName: string,
): Promise<MerchantAIResponse> => {

    const response = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0,
        response_format: {
            type: "json_object",
        },
        messages: [
            {
                role: "system",
                content: MERCHANT_SYSTEM_PROMPT,
            },
            {
                role: "user",
                content: merchantName,
            },
        ],
    });

    const text =
        response.choices[0]?.message?.content?.trim();

    if (!text) {
        throw new Error("OpenAI returned an empty response.");
    }

    let result: MerchantAIResponse;

    try {
        result = JSON.parse(text);
    } catch {
        throw new Error("Failed to parse merchant AI response.");
    }

    if (!result.merchant) {
        return {
            merchant: merchantName,
            confidence: 0,
        };
    }

    if (typeof result.confidence !== "number") {
        result.confidence = 0;
    }

    result.confidence = Math.max(
        0,
        Math.min(1, result.confidence),
    );

    return result;
};

/* -------------------------------------------------------------------------- */
/*                        Categorize Merchant (AI)                            */
/* -------------------------------------------------------------------------- */

export const categorizeMerchantWithAI = async (
    merchantName: string,
    transactionType: TransactionType,
    categoryOptions: MerchantCategoryOption[],
): Promise<MerchantAIResult> => {

    const availableCategories = categoryOptions.map(category => ({
        id: category.id,
        path: category.path,
    }));

    const prompt = `
Transaction Type:
${transactionType}

Merchant:
${merchantName}

Available Categories:
${JSON.stringify(availableCategories, null, 2)}

Return ONLY valid JSON.
`;

    const response = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0,
        response_format: {
            type: "json_object",
        },
        messages: [
            {
                role: "system",
                content: CATEGORY_SYSTEM_PROMPT,
            },
            {
                role: "user",
                content: prompt,
            },
        ],
    });

    const text =
        response.choices[0]?.message?.content?.trim();

    if (!text) {
        throw new Error("OpenAI returned an empty response.");
    }

    let result: MerchantAIResult;

    try {
        result = JSON.parse(text);
    } catch {
        throw new Error("Failed to parse category AI response.");
    }

    if (!result.categoryId) {
        throw new Error("AI did not return a category.");
    }

    if (typeof result.confidence !== "number") {
        result.confidence = 0;
    }

    result.confidence = Math.max(
        0,
        Math.min(1, result.confidence),
    );

    result.reasoning ??= "";

    const valid = availableCategories.some(
        category => category.id === result.categoryId,
    );

    if (!valid) {
        throw new Error(
            `Unknown categoryId returned: ${result.categoryId}`,
        );
    }

    return result;
};