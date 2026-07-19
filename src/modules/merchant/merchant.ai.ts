import {TransactionType} from "@prisma/client";

import {openai} from "../../lib/openai";
import {MerchantAIResult, MerchantCategoryTreeNode,} from "./merchant.types";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const SYSTEM_PROMPT = `
You are an expert financial transaction categorization assistant.

Rules:
- Choose exactly one categoryId from the provided category tree.
- Never invent category IDs.
- Prefer the most specific subcategory when possible.
- If unsure, choose the closest matching category.
- Confidence must be between 0 and 1.
- Return ONLY valid JSON.

JSON format:

{
  "categoryId": "uuid",
  "confidence": 0.95,
  "reasoning": "short explanation"
}
`;

export const categorizeMerchantWithAI = async (
    merchantName: string,
    transactionType: TransactionType,
    categoryTree: MerchantCategoryTreeNode[],
): Promise<MerchantAIResult> => {

    const prompt = `
Transaction Type:
${transactionType}

Merchant:
${merchantName}

Available Categories:

${JSON.stringify(categoryTree, null, 2)}

Return only JSON.
`;

    const response = await openai.chat.completions.create({
        model: MODEL,
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

    const text = response.choices[0]?.message?.content?.trim();
    
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

    return result;
};