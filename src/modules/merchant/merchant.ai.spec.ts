import {beforeEach, describe, expect, it, vi} from "vitest";
import {TransactionType} from "@prisma/client";
import {openai} from "../../lib/openai";
import {categorizeMerchantWithAI} from "./merchant.ai";

vi.mock("../../lib/openai", () => ({
    openai: {
        chat: {
            completions: {
                create: vi.fn(),
            },
        },
    },
}));

const createMock = vi.mocked(openai.chat.completions.create);

const categoryTree = [
    {
        id: "food",
        name: "Food",
        type: TransactionType.EXPENSE,
        children: [],
    },
];

const mockResponse = (content: string | null) => ({
    choices: [
        {
            message: {
                content,
            },
        },
    ],
});

describe("categorizeMerchantWithAI", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        createMock.mockResolvedValue(
            mockResponse(
                JSON.stringify({
                    categoryId: "food",
                    confidence: 0.91,
                    reasoning: "Food delivery",
                }),
            ) as any,
        );
    });

    it("calls OpenAI with the expected payload", async () => {
        await categorizeMerchantWithAI(
            "Swiggy",
            TransactionType.EXPENSE,
            categoryTree,
        );

        expect(createMock).toHaveBeenCalledTimes(1);

        const request = createMock.mock.calls[0][0];

        expect(request.model).toBeDefined();
        expect(request.response_format).toEqual({
            type: "json_object",
        });

        expect(request.messages).toHaveLength(2);
        expect(request.messages[0].role).toBe("system");
        expect(request.messages[1].role).toBe("user");
        expect(request.messages[1].content).toContain("Swiggy");
        expect(request.messages[1].content).toContain("EXPENSE");
    });

    it("returns the parsed AI response", async () => {
        const result = await categorizeMerchantWithAI(
            "Swiggy",
            TransactionType.EXPENSE,
            categoryTree,
        );

        expect(result).toEqual({
            categoryId: "food",
            confidence: 0.91,
            reasoning: "Food delivery",
        });
    });

    it("throws when OpenAI returns an empty response", async () => {
        createMock.mockResolvedValue(
            mockResponse(null) as any,
        );

        await expect(
            categorizeMerchantWithAI(
                "Swiggy",
                TransactionType.EXPENSE,
                categoryTree,
            ),
        ).rejects.toThrow(
            "OpenAI returned an empty response.",
        );
    });

    it("throws when OpenAI returns invalid JSON", async () => {
        createMock.mockResolvedValue(
            mockResponse("{invalid") as any,
        );

        await expect(
            categorizeMerchantWithAI(
                "Swiggy",
                TransactionType.EXPENSE,
                categoryTree,
            ),
        ).rejects.toThrow(
            "Failed to parse AI response.",
        );
    });

    it("throws when categoryId is missing", async () => {
        createMock.mockResolvedValue(
            mockResponse(
                JSON.stringify({
                    confidence: 0.9,
                    reasoning: "Missing category",
                }),
            ) as any,
        );

        await expect(
            categorizeMerchantWithAI(
                "Swiggy",
                TransactionType.EXPENSE,
                categoryTree,
            ),
        ).rejects.toThrow(
            "AI did not return a categoryId.",
        );
    });

    it("defaults confidence when it is not a number", async () => {
        createMock.mockResolvedValue(
            mockResponse(
                JSON.stringify({
                    categoryId: "food",
                    confidence: "high",
                    reasoning: "Food",
                }),
            ) as any,
        );

        const result = await categorizeMerchantWithAI(
            "Swiggy",
            TransactionType.EXPENSE,
            categoryTree,
        );

        expect(result.confidence).toBe(0);
    });

    it("clamps confidence above 1", async () => {
        createMock.mockResolvedValue(
            mockResponse(
                JSON.stringify({
                    categoryId: "food",
                    confidence: 5,
                    reasoning: "",
                }),
            ) as any,
        );

        const result = await categorizeMerchantWithAI(
            "Swiggy",
            TransactionType.EXPENSE,
            categoryTree,
        );

        expect(result.confidence).toBe(1);
    });

    it("clamps confidence below 0", async () => {
        createMock.mockResolvedValue(
            mockResponse(
                JSON.stringify({
                    categoryId: "food",
                    confidence: -1,
                    reasoning: "",
                }),
            ) as any,
        );

        const result = await categorizeMerchantWithAI(
            "Swiggy",
            TransactionType.EXPENSE,
            categoryTree,
        );

        expect(result.confidence).toBe(0);
    });

    it("defaults reasoning to an empty string", async () => {
        createMock.mockResolvedValue(
            mockResponse(
                JSON.stringify({
                    categoryId: "food",
                    confidence: 0.5,
                }),
            ) as any,
        );

        const result = await categorizeMerchantWithAI(
            "Swiggy",
            TransactionType.EXPENSE,
            categoryTree,
        );

        expect(result.reasoning).toBe("");
    });

    it("trims the response before parsing", async () => {
        createMock.mockResolvedValue(
            mockResponse(`
                {
                    "categoryId":"food",
                    "confidence":0.8,
                    "reasoning":"Food"
                }
            `) as any,
        );

        const result = await categorizeMerchantWithAI(
            "Swiggy",
            TransactionType.EXPENSE,
            categoryTree,
        );

        expect(result.categoryId).toBe("food");
    });

    it("includes the category tree in the prompt", async () => {
        await categorizeMerchantWithAI(
            "Swiggy",
            TransactionType.EXPENSE,
            categoryTree,
        );

        const request = createMock.mock.calls[0][0];
        const prompt = request.messages[1].content as string;

        expect(prompt).toContain('"id": "food"');
        expect(prompt).toContain('"name": "Food"');
    });
});