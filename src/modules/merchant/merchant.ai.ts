import {TransactionType} from "@prisma/client";

import {openai} from "../../lib/openai";
import {MerchantAIResult, MerchantCategoryOption,} from "./merchant.types";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

const SYSTEM_PROMPT = `
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
9. If the merchant name does not provide enough information to confidently classify it, choose the "Extra > Misc" category (or the equivalent miscellaneous category if available).
10. Do not guess a specific category without reasonable evidence.

Return format:

{
  "categoryId": "<existing id>",
  "confidence": 0.97,
  "reasoning": "short explanation"
}
`;

export const categorizeMerchantWithAI = async (
    merchantName: string,
    transactionType: TransactionType,
    categoryOptions: MerchantCategoryOption[],
): Promise<MerchantAIResult> => {

    // Keep only the information the model actually needs.
    // This reduces prompt size and improves classification quality.
    const availableCategories = categoryOptions.map(category => ({
        id: category.id,
        path: category.path,
    }));

    const prompt = `
Transaction Type:
${transactionType}

Merchant:
${merchantName}

Available Categories (leaf categories only):

${JSON.stringify(availableCategories, null, 2)}

Choose the SINGLE best category.

Return ONLY valid JSON.
`;

    const response = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0,
        messages: [
            {
                role: "system",
                content: SYSTEM_PROMPT,
            },
            {
                role: "user",
                content: prompt,
            },
        ],
        response_format: {
            type: "json_object",
        },
    });

    const text =
        response.choices[0]?.message?.content?.trim();

    console.log("===== AI RAW RESPONSE =====");
    console.log(text);
    console.log("===========================");

    if (!text) {
        throw new Error("OpenAI returned an empty response.");
    }

    let result: MerchantAIResult;

    try {
        result = JSON.parse(text);
    } catch {
        throw new Error("Failed to parse AI response.");
    }

    if (!result.categoryId) {
        throw new Error("AI did not return a categoryId.");
    }

    if (typeof result.confidence !== "number") {
        result.confidence = 0;
    }

    result.confidence = Math.max(
        0,
        Math.min(1, result.confidence),
    );

    result.reasoning ??= "";

    // Validate that the returned ID exists in the supplied categories.
    const validCategory = availableCategories.some(
        category => category.id === result.categoryId,
    );

    if (!validCategory) {
        throw new Error(
            `AI returned an unknown categoryId: ${result.categoryId}`,
        );
    }

    return result;
};