import OpenAI from "openai";
import {Category, TransactionType} from "@prisma/client";

export interface MerchantCategorizationAIResult {
    parentCategoryId: string;
    subcategoryId: string | null;
    confidence: number;
    reasoning: string;
}

interface CategoryNode {
    id: string;
    name: string;
    children: CategoryNode[];
}

export class MerchantAIService {
    private readonly openai: OpenAI;
    private readonly model: string;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        this.model = process.env.OPENAI_MODEL ?? "gpt-5-mini";
    }

    async categorizeMerchant(
        merchantName: string,
        transactionType: TransactionType,
        categories: Category[],
    ): Promise<MerchantCategorizationAIResult | null> {
        const availableCategories = categories.filter(
            (category) => category.type === transactionType,
        );

        if (availableCategories.length === 0) {
            return null;
        }

        const categoryTree = this.buildCategoryTree(availableCategories);

        const prompt = `
You are an expert personal finance assistant.

Your task is to classify a merchant into one of the user's categories.

Merchant:
"${merchantName}"

Transaction Type:
${transactionType}

Available Category Tree:

${JSON.stringify(categoryTree, null, 2)}

Rules:

1. Never invent categories.
2. Always choose from the provided IDs.
3. Prefer a subcategory whenever one clearly matches.
4. If no subcategory matches, choose the parent category.
5. Return ONLY valid IDs.
6. Confidence must be between 0 and 1.

Return JSON only.
`;

        try {
            const response = await this.openai.responses.create({
                model: this.model,

                input: [
                    {
                        role: "system",
                        content:
                            "You are a finance transaction categorization assistant.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],

                text: {
                    format: {
                        type: "json_schema",
                        name: "merchant_category_result",
                        schema: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                                parentCategoryId: {
                                    type: "string",
                                },
                                subcategoryId: {
                                    type: ["string", "null"],
                                },
                                confidence: {
                                    type: "number",
                                },
                                reasoning: {
                                    type: "string",
                                },
                            },
                            required: [
                                "parentCategoryId",
                                "subcategoryId",
                                "confidence",
                                "reasoning",
                            ],
                        },
                    },
                },
            });

            if (!response.output_text) {
                return null;
            }

            const parsed = JSON.parse(
                response.output_text,
            ) as MerchantCategorizationAIResult;

            const validIds = new Set(
                availableCategories.map((category) => category.id),
            );

            if (!validIds.has(parsed.parentCategoryId)) {
                return null;
            }

            if (
                parsed.subcategoryId &&
                !validIds.has(parsed.subcategoryId)
            ) {
                return null;
            }

            parsed.confidence = Math.max(
                0,
                Math.min(1, parsed.confidence),
            );

            return parsed;
        } catch (error) {
            console.error("Merchant AI categorization failed", error);
            return null;
        }
    }

    /**
     * Converts a flat Prisma category list into a parent-child tree.
     */
    private buildCategoryTree(categories: Category[]): CategoryNode[] {
        const map = new Map<string, CategoryNode>();

        for (const category of categories) {
            map.set(category.id, {
                id: category.id,
                name: category.name,
                children: [],
            });
        }

        const roots: CategoryNode[] = [];

        for (const category of categories) {
            const node = map.get(category.id)!;

            if (category.parentId) {
                const parent = map.get(category.parentId);

                if (parent) {
                    parent.children.push(node);
                } else {
                    roots.push(node);
                }
            } else {
                roots.push(node);
            }
        }

        return roots;
    }
}

export const merchantAIService = new MerchantAIService();