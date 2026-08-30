import OpenAI from "openai";

let client: OpenAI | null = null;

export const getOpenAI = () => {
    if (!client) {
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) {
            throw new Error("GROQ_API_KEY is not configured.");
        }

        client = new OpenAI({
            apiKey,
            baseURL: "https://api.groq.com/openai/v1",
        });
    }

    return client;
};